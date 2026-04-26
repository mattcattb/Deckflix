import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException, NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {withRedisLock} from "../lib/redis-lock";
import * as RecommendationsService from "../recommendations/recommendations.service";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  type RealtimeServer,
} from "../realtime/realtime.service";
import * as RoomsService from "../rooms/rooms.service";
import {applyVoteToMovieState} from "./match-rules";

export type VoteRecord = {
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
  votedAt: string;
};

const swipeChoices = new Set<SwipeChoice>([
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
]);

const roomPrefix = (gameCode: string) => `game:${RoomsService.normalizeGameCode(gameCode)}:`;
const votesKey = (gameCode: string, movieId: string) =>
  `${roomPrefix(gameCode)}votes:${movieId}`;
const movieStateKey = (gameCode: string) => `${roomPrefix(gameCode)}movie_state`;
const voteLockKey = (gameCode: string, movieId: string) =>
  `${roomPrefix(gameCode)}vote_lock:${movieId}`;

const parseVoteRecord = (
  playerId: string,
  movieId: string,
  raw: string,
): VoteRecord | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<VoteRecord>;
    return parsed.choice && swipeChoices.has(parsed.choice)
      ? {
          playerId,
          movieId,
          choice: parsed.choice,
          votedAt: parsed.votedAt ?? new Date(0).toISOString(),
        }
      : null;
  } catch {
    return null;
  }
};

const parseMovieState = (
  raw: string | null,
  gameCode: string,
  movieId: string,
): RecommendationsService.MovieState => {
  if (!raw) {
    throw new NotFoundException(
      `Movie ${movieId} not found in game ${RoomsService.normalizeGameCode(gameCode)}`,
    );
  }

  return JSON.parse(raw) as RecommendationsService.MovieState;
};

export const recordVote = async (input: {
  gameCode: string;
  movieId: string;
  playerId: string;
  choice: SwipeChoice;
}) => {
  await ensureRedis();
  const votedAt = new Date().toISOString();
  const totalPlayers = await RoomsService.countPlayers(input.gameCode);

  return withRedisLock(
    {
      key: voteLockKey(input.gameCode, input.movieId),
      ttlMs: 2_000,
      retryCount: 20,
      retryDelayMs: 25,
      busyMessage: "Movie vote is busy, please try again",
    },
    async () => {
      const state = parseMovieState(
        await redis.hGet(movieStateKey(input.gameCode), input.movieId),
        input.gameCode,
        input.movieId,
      );
      const voteSet = await redis.hSetNX(
        votesKey(input.gameCode, input.movieId),
        input.playerId,
        JSON.stringify({
          choice: input.choice,
          votedAt,
        }),
      );
      if (!voteSet) {
        throw new BadRequestException("Vote already recorded for this movie");
      }

      const next = applyVoteToMovieState({
        state,
        choice: input.choice,
        totalPlayers,
        votedAt,
      });
      const multi = redis.multi();
      multi.hSet(
        movieStateKey(input.gameCode),
        input.movieId,
        JSON.stringify(next.state),
      );
      multi.expire(votesKey(input.gameCode, input.movieId), RoomsService.ROOM_TTL_SECONDS);
      multi.expire(movieStateKey(input.gameCode), RoomsService.ROOM_TTL_SECONDS);
      await multi.exec();

      return next;
    },
  );
};

export const getMovieVoteRecords = async (gameCode: string, movieId: string) => {
  await ensureRedis();
  const rawVotes = await redis.hGetAll(votesKey(gameCode, movieId));
  return Object.entries(rawVotes)
    .map(([playerId, raw]) => parseVoteRecord(playerId, movieId, raw))
    .filter((record): record is VoteRecord => Boolean(record));
};

export const getVoteRecords = async (gameCode: string) => {
  const movieIds = await RecommendationsService.listPoolMovieIds(gameCode);
  return (
    await Promise.all(
      movieIds.map((movieId) => getMovieVoteRecords(gameCode, movieId)),
    )
  ).flat();
};

export const getMovieVoteSummaries = async (
  gameCode: string,
  movieIds: string[],
) => {
  const entries = await Promise.all(
    movieIds.map(async (movieId) => [
      movieId,
      await getMovieVoteRecords(gameCode, movieId),
    ] as const),
  );
  return new Map(entries);
};

export const publishVoteRecorded = (input: {
  server: RealtimeServer;
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  const message = {
    type: "swipe.vote_recorded" as const,
    payload: {
      playerId: input.playerId,
      movieId: input.movieId,
      choice: input.choice,
    },
  };

  publishDisplayMessage(input.server, input.gameCode, message);
  publishPlayerMessage(input.server, input.gameCode, input.playerId, message);
};

export const publishMatchFound = (
  server: RealtimeServer,
  gameCode: string,
  movieId: string,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "swipe.match_found",
    payload: {
      movieId,
    },
  });
};

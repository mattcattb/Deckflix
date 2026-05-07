import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import * as PoolService from "../recommendations/pool.service";
import {ensureRedis, redisClient} from "../redis/redis";
import * as MovieStateService from "./movie-state.service";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  type RealtimeServer,
} from "../realtime/realtime.service";
import * as RoomsService from "../rooms/rooms.service";
import {getVoteCountField, resolveMovieState} from "./match.service";

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

const roomPrefix = (gameCode: string) =>
  `game:${RoomsService.normalizeGameCode(gameCode)}:`;
const votesKey = (gameCode: string, movieId: string) =>
  `${roomPrefix(gameCode)}votes:${movieId}`;

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

export const recordVote = async (input: {
  gameCode: string;
  movieId: string;
  playerId: string;
  choice: SwipeChoice;
}) => {
  await ensureRedis();
  const votedAt = new Date().toISOString();
  const totalPlayers = await RoomsService.countPlayers(input.gameCode);
  const previousState = await MovieStateService.getMovieStateOrThrow(
    input.gameCode,
    input.movieId,
  );

  const voteSet = await redisClient.hSetNX(
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

  await redisClient.expire(
    votesKey(input.gameCode, input.movieId),
    RoomsService.ROOM_TTL_SECONDS,
  );

  await MovieStateService.incrementMovieVoteState({
    gameCode: input.gameCode,
    movieId: input.movieId,
    countField: getVoteCountField(input.choice),
    votedAt,
  });
  const incrementedState = await MovieStateService.getMovieStateOrThrow(
    input.gameCode,
    input.movieId,
  );
  const next = resolveMovieState({
    state: incrementedState,
    totalPlayers,
    votedAt,
  });
  await MovieStateService.setMovieResolution(
    input.gameCode,
    input.movieId,
    next.state,
  );

  return {
    ...next,
    justMatched:
      previousState.status !== "matched" && next.state.status === "matched",
  };
};

export const getMovieVoteRecords = async (
  gameCode: string,
  movieId: string,
) => {
  await ensureRedis();
  const rawVotes = await redisClient.hGetAll(votesKey(gameCode, movieId));
  return Object.entries(rawVotes)
    .map(([playerId, raw]) => parseVoteRecord(playerId, movieId, raw))
    .filter((record): record is VoteRecord => Boolean(record));
};

export const getVoteRecords = async (gameCode: string) => {
  const movieIds = await PoolService.listPoolMovieIds(gameCode);
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
    movieIds.map(
      async (movieId) =>
        [movieId, await getMovieVoteRecords(gameCode, movieId)] as const,
    ),
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

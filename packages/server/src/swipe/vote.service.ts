import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException, NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {withRedisLock} from "../lib/redis-lock";
import * as PoolService from "../pool/pool.service";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
} from "../rooms/room-lifecycle.service";
import * as RoomPlayersService from "../rooms/room-players.service";

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

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;
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
): PoolService.MovieState => {
  if (!raw) {
    throw new NotFoundException(
      `Movie ${movieId} not found in game ${normalizeGameCode(gameCode)}`,
    );
  }

  return JSON.parse(raw) as PoolService.MovieState;
};

const applyVoteToMovieState = (input: {
  state: PoolService.MovieState;
  choice: SwipeChoice;
  totalPlayers: number;
  votedAt: string;
}) => {
  const previousStatus = input.state.status;
  const state: PoolService.MovieState = {
    ...input.state,
    totalVotes: input.state.totalVotes + 1,
    lastActivityAt: input.votedAt,
    resolvedAt: input.state.resolvedAt ?? null,
    matchedAt: input.state.matchedAt ?? null,
  };

  switch (input.choice) {
    case "like":
      state.likeCount += 1;
      break;
    case "dislike":
      state.dislikeCount += 1;
      break;
    case "maybe":
      state.maybeCount += 1;
      break;
    case "super_like":
      state.superLikeCount += 1;
      break;
    case "skip":
      state.skipCount += 1;
      break;
  }

  const positiveVotes = state.likeCount + state.superLikeCount;
  const hasBlockingVote =
    state.dislikeCount > 0 || state.maybeCount > 0 || state.skipCount > 0;

  if (
    input.totalPlayers > 0 &&
    state.totalVotes === input.totalPlayers &&
    positiveVotes === input.totalPlayers
  ) {
    state.status = "matched";
  } else if (hasBlockingVote) {
    state.status = "rejected";
  } else if (input.totalPlayers > 0 && state.totalVotes === input.totalPlayers) {
    state.status = "rejected";
  } else {
    state.status = "pending";
  }

  if (state.status === "pending") {
    state.resolvedAt = null;
    state.matchedAt = null;
  } else {
    state.resolvedAt = state.resolvedAt ?? input.votedAt;
    state.matchedAt =
      state.status === "matched" ? state.matchedAt ?? input.votedAt : null;
  }

  return {
    justMatched: previousStatus !== "matched" && state.status === "matched",
    state,
  };
};

export const recordVote = async (input: {
  gameCode: string;
  movieId: string;
  playerId: string;
  choice: SwipeChoice;
}) => {
  await ensureRedis();
  const votedAt = new Date().toISOString();
  const totalPlayers = await RoomPlayersService.countPlayers(input.gameCode);

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
      multi.expire(votesKey(input.gameCode, input.movieId), ROOM_TTL_SECONDS);
      multi.expire(movieStateKey(input.gameCode), ROOM_TTL_SECONDS);
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
    movieIds.map(async (movieId) => [
      movieId,
      await getMovieVoteRecords(gameCode, movieId),
    ] as const),
  );
  return new Map(entries);
};

import type {SwipeChoice} from "@deckflix/shared";
import {ensureRedis, redis} from "../lib/redis";
import * as GameRedisService from "../games/game-redis.service";

const votesKey = (gameCode: string, movieId: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:votes:${movieId}`;
const matchesKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:matches`;
const rejectionsKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:rejections`;

export const getPlayerVote = async (
  gameCode: string,
  movieId: string,
  playerId: string,
) => {
  await ensureRedis();
  return redis.hGet(votesKey(gameCode, movieId), playerId);
};

export const setPlayerVote = async (
  gameCode: string,
  movieId: string,
  playerId: string,
  choice: SwipeChoice,
) => {
  await ensureRedis();
  await redis.hSet(votesKey(gameCode, movieId), playerId, choice);
};

export const queueSetPlayerVote = (
  multi: ReturnType<typeof redis.multi>,
  gameCode: string,
  movieId: string,
  playerId: string,
  choice: SwipeChoice,
) => multi.hSet(votesKey(gameCode, movieId), playerId, choice);

export const syncMovieOutcomeSets = async (
  gameCode: string,
  movieId: string,
  status: GameRedisService.MovieStatus,
) => {
  await ensureRedis();

  if (status === "matched") {
    await redis.sAdd(matchesKey(gameCode), movieId);
    await redis.sRem(rejectionsKey(gameCode), movieId);
    return;
  }

  if (status === "rejected") {
    await redis.sAdd(rejectionsKey(gameCode), movieId);
    await redis.sRem(matchesKey(gameCode), movieId);
    return;
  }

  await redis.sRem(matchesKey(gameCode), movieId);
  await redis.sRem(rejectionsKey(gameCode), movieId);
};

export const queueSyncMovieOutcomeSets = (
  multi: ReturnType<typeof redis.multi>,
  gameCode: string,
  movieId: string,
  status: GameRedisService.MovieStatus,
) => {
  if (status === "matched") {
    return multi
      .sAdd(matchesKey(gameCode), movieId)
      .sRem(rejectionsKey(gameCode), movieId);
  }

  if (status === "rejected") {
    return multi
      .sAdd(rejectionsKey(gameCode), movieId)
      .sRem(matchesKey(gameCode), movieId);
  }

  return multi
    .sRem(matchesKey(gameCode), movieId)
    .sRem(rejectionsKey(gameCode), movieId);
};

export const getMatchedMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.sMembers(matchesKey(gameCode));
};

export const getRejectedMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.sMembers(rejectionsKey(gameCode));
};

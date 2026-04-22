import type {SwipeChoice} from "@deckflix/shared";
import {ensureRedis, redis} from "../lib/redis";
import {normalizeGameCode, type MovieStatus} from "../games/game-redis.service";

const votesKey = (gameCode: string, movieId: string) =>
  `game:${normalizeGameCode(gameCode)}:votes:${movieId}`;
const matchesKey = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:matches`;
const rejectionsKey = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:rejections`;

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

export const syncMovieOutcomeSets = async (
  gameCode: string,
  movieId: string,
  status: MovieStatus,
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

export const getMatchedMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.sMembers(matchesKey(gameCode));
};

export const getRejectedMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.sMembers(rejectionsKey(gameCode));
};

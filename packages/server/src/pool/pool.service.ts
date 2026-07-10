import {redisClient} from "../redis/redis";
import {normalizeGameCode, roomPrefix, ROOM_TTL_SECONDS} from "../rooms/room-keys";

export type PoolEntry = {
  movieId: string;
  order: number;
};

export type PoolSource = {
  source: "discovery" | "taste" | "suggestion";
  suggestedByPlayerId?: string;
  suggestedByName?: string;
};

const poolKey = (gameCode: string) => `${roomPrefix(gameCode)}pool`;
const poolSignalsKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}pool_signals`;
const poolSourcesKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}pool_sources`;

export const replacePool = async (gameCode: string, movieIds: string[]) => {
  const pool = poolKey(gameCode);
  const multi = redisClient.multi();

  multi.del([pool]);
  if (movieIds.length > 0) {
    multi.rPush(pool, movieIds);
  }
  multi.expire(pool, ROOM_TTL_SECONDS);
  await multi.exec();
};

export const appendPoolMovieIds = async (
  gameCode: string,
  movieIds: string[],
) => {
  if (movieIds.length === 0) {
    return [];
  }

  const pool = poolKey(gameCode);
  const existingIds = new Set(await redisClient.lRange(pool, 0, -1));
  const nextMovieIds = movieIds.filter((movieId) => !existingIds.has(movieId));
  if (nextMovieIds.length === 0) {
    return [];
  }

  await redisClient
    .multi()
    .rPush(pool, nextMovieIds)
    .expire(pool, ROOM_TTL_SECONDS)
    .exec();

  return nextMovieIds;
};

export const listPoolEntries = async (
  gameCode: string,
): Promise<PoolEntry[]> => {
  const movieIds = await redisClient.lRange(poolKey(gameCode), 0, -1);
  return movieIds.map((movieId, order) => ({movieId, order}));
};

export const listPoolMovieIds = async (gameCode: string) => {
  return redisClient.lRange(poolKey(gameCode), 0, -1);
};

export const getPoolSize = async (gameCode: string) => {
  return redisClient.lLen(poolKey(normalizeGameCode(gameCode)));
};

export const getPoolSignals = async (gameCode: string, movieIds: string[]) => {
  if (movieIds.length === 0) {
    return new Map<string, number>();
  }

  const scores = await redisClient.zmScore(poolSignalsKey(gameCode), movieIds);
  return new Map(
    movieIds.map((movieId, index) => [movieId, scores[index] ?? 0] as const),
  );
};

export const addPoolSignal = async (
  gameCode: string,
  movieId: string,
  weight: number,
) => {
  const key = poolSignalsKey(gameCode);
  await redisClient
    .multi()
    .zIncrBy(key, weight, movieId)
    .expire(key, ROOM_TTL_SECONDS)
    .exec();
};

export const setPoolSource = async (
  gameCode: string,
  movieId: string,
  source: PoolSource,
) => {
  const key = poolSourcesKey(gameCode);
  await redisClient
    .multi()
    .hSet(key, movieId, JSON.stringify(source))
    .expire(key, ROOM_TTL_SECONDS)
    .exec();
};

export const getPoolSource = async (gameCode: string, movieId: string) => {
  const raw = await redisClient.hGet(poolSourcesKey(gameCode), movieId);
  return raw ? (JSON.parse(raw) as PoolSource) : {source: "discovery" as const};
};

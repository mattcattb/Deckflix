import {redisClient} from "../redis/redis";
import {normalizeGameCode, roomPrefix, ROOM_TTL_SECONDS} from "../rooms/room-keys";

export type PoolEntry = {
  movieId: string;
  order: number;
};

const poolKey = (gameCode: string) => `${roomPrefix(gameCode)}pool`;

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

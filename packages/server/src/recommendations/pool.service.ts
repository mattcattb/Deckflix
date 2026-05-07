import type {MovieCandidate} from "@deckflix/shared";
import {movieCandidateSchema} from "@deckflix/shared";
import {z} from "zod";
import {NotFoundException} from "../common/errors";
import {parseJson} from "../lib/json";
import {ensureRedis, redisClient} from "../redis/redis";
import * as RoomsService from "../rooms/rooms.service";

export type PoolEntry = {
  movieId: string;
  order: number;
};

export type MovieMeta = z.infer<typeof movieCandidateSchema>;

const roomPrefix = (gameCode: string) =>
  `game:${RoomsService.normalizeGameCode(gameCode)}:`;
const poolKey = (gameCode: string) => `${roomPrefix(gameCode)}pool`;
const moviesKey = (gameCode: string) => `${roomPrefix(gameCode)}movies`;

export const replacePool = async (
  gameCode: string,
  movies: MovieCandidate[],
) => {
  await ensureRedis();
  const pool = poolKey(gameCode);
  const movieHash = moviesKey(gameCode);
  const multi = redisClient.multi();

  multi.del([pool, movieHash]);
  if (movies.length > 0) {
    multi.rPush(
      pool,
      movies.map((movie) => movie.id),
    );
    for (const movie of movies) {
      multi.hSet(movieHash, movie.id, JSON.stringify(movie));
    }
  }
  multi.expire(pool, RoomsService.ROOM_TTL_SECONDS);
  multi.expire(movieHash, RoomsService.ROOM_TTL_SECONDS);
  await multi.exec();
};

export const appendPoolMovies = async (
  gameCode: string,
  movies: MovieCandidate[],
) => {
  await ensureRedis();
  if (movies.length === 0) {
    return [];
  }

  const pool = poolKey(gameCode);
  const movieHash = moviesKey(gameCode);
  const existingIds = new Set(await redisClient.lRange(pool, 0, -1));
  const nextMovies = movies.filter((movie) => !existingIds.has(movie.id));
  if (nextMovies.length === 0) {
    return [];
  }

  const multi = redisClient.multi();
  multi.rPush(
    pool,
    nextMovies.map((movie) => movie.id),
  );
  for (const movie of nextMovies) {
    multi.hSet(movieHash, movie.id, JSON.stringify(movie));
  }
  multi.expire(pool, RoomsService.ROOM_TTL_SECONDS);
  multi.expire(movieHash, RoomsService.ROOM_TTL_SECONDS);
  await multi.exec();
  return nextMovies;
};

export const listPoolEntries = async (
  gameCode: string,
): Promise<PoolEntry[]> => {
  await ensureRedis();
  const movieIds = await redisClient.lRange(poolKey(gameCode), 0, -1);
  return movieIds.map((movieId, order) => ({movieId, order}));
};

export const listPoolMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redisClient.lRange(poolKey(gameCode), 0, -1);
};

export const getPoolSize = async (gameCode: string) => {
  await ensureRedis();
  return redisClient.lLen(poolKey(gameCode));
};

export const getMovieMetaOrThrow = async (
  gameCode: string,
  movieId: string,
): Promise<MovieMeta> => {
  await ensureRedis();
  const normalized = RoomsService.normalizeGameCode(gameCode);
  const raw = await redisClient.hGet(moviesKey(normalized), movieId);
  if (!raw) {
    throw new NotFoundException(
      `Movie ${movieId} not found in game ${normalized}`,
    );
  }

  return parseJson(
    raw,
    movieCandidateSchema,
    `Movie ${movieId} not found in game ${normalized}`,
  );
};

export const getMovieMetas = async (gameCode: string, movieIds: string[]) => {
  await ensureRedis();
  const normalized = RoomsService.normalizeGameCode(gameCode);
  if (movieIds.length === 0) {
    return new Map<string, MovieMeta>();
  }

  const raws = await redisClient.hmGet(moviesKey(normalized), movieIds);
  return new Map(
    movieIds.map((movieId, index) => {
      const raw = raws[index];
      if (!raw) {
        throw new NotFoundException(
          `Movie ${movieId} not found in game ${normalized}`,
        );
      }

      return [
        movieId,
        parseJson(
          raw,
          movieCandidateSchema,
          `Movie ${movieId} not found in game ${normalized}`,
        ),
      ] as const;
    }),
  );
};

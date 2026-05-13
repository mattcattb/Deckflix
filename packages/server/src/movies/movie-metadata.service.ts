import type {MovieCandidate} from "@deckflix/shared";
import {movieCandidateSchema} from "@deckflix/shared";
import {NotFoundException} from "../common/errors";
import {parseJson} from "../lib/json";
import {redisClient} from "../redis/redis";
import {normalizeGameCode, roomPrefix, ROOM_TTL_SECONDS} from "../rooms/room-keys";

export type MovieMetadata = MovieCandidate;

const moviesKey = (gameCode: string) => `${roomPrefix(gameCode)}movies`;

export const replaceRoomMovieMetadata = async (
  gameCode: string,
  movies: MovieCandidate[],
) => {
  const key = moviesKey(gameCode);
  const multi = redisClient.multi();

  multi.del(key);
  for (const movie of movies) {
    multi.hSet(key, movie.id, JSON.stringify(movie));
  }
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
};

export const upsertRoomMovieMetadata = async (
  gameCode: string,
  movies: MovieCandidate[],
) => {
  if (movies.length === 0) {
    return;
  }

  const key = moviesKey(gameCode);
  const multi = redisClient.multi();
  for (const movie of movies) {
    multi.hSet(key, movie.id, JSON.stringify(movie));
  }
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
};

export const getRoomMovieMetadataOrThrow = async (
  gameCode: string,
  movieId: string,
): Promise<MovieMetadata> => {
  const normalized = normalizeGameCode(gameCode);
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

export const getRoomMovieMetadataMap = async (
  gameCode: string,
  movieIds: string[],
) => {
  const normalized = normalizeGameCode(gameCode);
  if (movieIds.length === 0) {
    return new Map<string, MovieMetadata>();
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

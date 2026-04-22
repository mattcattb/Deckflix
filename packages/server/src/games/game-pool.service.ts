import type {MovieCandidate} from "@deckflix/shared";
import type {GameSettings} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import * as MoviesService from "../movies/movies.service";
import {discoverTmdbMovies, isTmdbConfigured} from "../lib/tmdb";
import * as GameSettingsService from "../settings/game-settings.service";
import {ensureRedis, redis} from "../lib/redis";
import * as GameRedisService from "./game-redis.service";
import type * as SwipeQueueService from "../swipe/swipe-queue.service";

const poolKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool`;

export const buildInitialPool = async (input: {
  settings: GameSettings;
}): Promise<MovieCandidate[]> => {
  const items: MovieCandidate[] = [];
  const seenMovieIds = new Set<string>();
  let page = 1;
  let totalPages = 1;
  const maxMovies = input.settings.maxMovies;
  const filters = GameSettingsService.buildMovieDiscoveryFilters(input.settings);

  while (items.length < maxMovies && page <= totalPages) {
    const result = isTmdbConfigured()
      ? await discoverTmdbMovies({
        page,
        genreIds: filters.genreIds,
        sortBy: filters.sortBy,
        voteCountGte: filters.voteCountGte,
      }).catch(() => MoviesService.getPopularMovies({page}))
      : await MoviesService.getPopularMovies({page});

    totalPages = result.totalPages;

    for (const movie of result.items) {
      if (seenMovieIds.has(movie.id)) {
        continue;
      }

      seenMovieIds.add(movie.id);
      items.push(movie);

      if (items.length >= maxMovies) {
        break;
      }
    }

    page += 1;
  }

  if (items.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  return items;
};

export const saveInitialPool = async (gameCode: string, movies: MovieCandidate[]) => {
  if (movies.length === 0) {
    return;
  }

  await ensureRedis();
  await redis.del(poolKey(gameCode));
  await redis.zAdd(
    poolKey(gameCode),
    movies.map((movie, order) => ({
      value: movie.id,
      score: order,
    })),
  );

  for (const movie of movies) {
    const record: GameRedisService.MovieRecord = {
      movie,
      status: "pending",
      likeCount: 0,
      dislikeCount: 0,
      maybeCount: 0,
      superLikeCount: 0,
      skipCount: 0,
      totalVotes: 0,
    };
    await GameRedisService.setMovieRecord(gameCode, movie.id, record);
  }
};

export const getPoolEntries = async (
  gameCode: string,
): Promise<SwipeQueueService.PlayerQueueEntry[]> => {
  await ensureRedis();
  const movieIds = await redis.zRange(poolKey(gameCode), 0, -1);
  return movieIds.map((movieId, order) => ({
    movieId,
    order,
  }));
};

export const getPoolSize = async (gameCode: string) => {
  await ensureRedis();
  return redis.zCard(poolKey(gameCode));
};

export const maybeRefillPool = async (_input: {gameCode: string}) => {
  return null;
};

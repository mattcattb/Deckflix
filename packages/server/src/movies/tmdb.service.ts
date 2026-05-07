import {createHash} from "node:crypto";
import type {
  AppendToResponse,
  AppendToResponseMovieKey,
  AvailableLanguage,
  MovieDetails as TmdbMovieDetails,
  TimeWindow,
  Search,
  Movie,
  PopularMovies,
  LanguageOption,
  PageOption,
  MovieQueryOptions,
  MovieDiscoverResult,
} from "tmdb-ts";
import {ServiceException} from "../common/errors";
import {getTmdbClient} from "../lib/tmdb";
import {ensureRedis, redisClient} from "../redis/redis";
import type {MovieSearchOptions} from "tmdb-ts/dist/endpoints";

type TmdbClient = ReturnType<typeof getTmdbClient>;

export type TmdbMovieRelatedOptions = NonNullable<
  Parameters<TmdbClient["movies"]["recommendations"]>[1]
> & {
  movieId: string | number;
};

export type TmdbMovieRecommendationsResult = Awaited<
  ReturnType<TmdbClient["movies"]["recommendations"]>
>;
export type TmdbMovieSimilarResult = Awaited<
  ReturnType<TmdbClient["movies"]["similar"]>
>;

export type TmdbLanguage = AvailableLanguage;
export const movieDetailsAppendKeys = [
  "credits",
  "videos",
  "images",
  "keywords",
  "release_dates",
  "recommendations",
  "similar",
  "watch/providers",
] as const satisfies readonly AppendToResponseMovieKey[];

type MovieDetailsAppendKey = (typeof movieDetailsAppendKeys)[number];

export type TmdbMovieDetailsWithAppends = AppendToResponse<
  TmdbMovieDetails,
  MovieDetailsAppendKey[],
  "movie"
>;

const TMDB_GENRE_CACHE_TTL_SECONDS = 60 * 60 * 24;
const TMDB_DISCOVER_CACHE_TTL_SECONDS = 60 * 60 * 6;
const TMDB_LIST_CACHE_TTL_SECONDS = 60 * 60;
const TMDB_RELATED_CACHE_TTL_SECONDS = 60 * 60 * 12;
const TMDB_MOVIE_DETAILS_CACHE_TTL_SECONDS = 60 * 60 * 12;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashValue = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

const cacheKey = (namespace: string, input: unknown) =>
  `tmdb:${namespace}:${hashValue(input)}`;

const getCached = async <T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> => {
  await ensureRedis();
  const cached = await redisClient.get(key);
  if (cached) {
    return JSON.parse(cached.toString()) as T;
  }

  const value = await load();
  await redisClient.set(key, JSON.stringify(value), {EX: ttlSeconds});
  return value;
};

const handleTmdbError = (error: unknown, fallbackMessage: string): never => {
  if (
    typeof error === "object" &&
    error !== null &&
    "status_message" in error &&
    typeof error.status_message === "string"
  ) {
    throw new ServiceException(error.status_message);
  }

  if (error instanceof Error) {
    throw new ServiceException(error.message || fallbackMessage);
  }

  throw new ServiceException(fallbackMessage);
};

export const toTmdbLanguage = (language?: string) =>
  (language ?? "en-US") as TmdbLanguage;

export const searchTmdbMovies = async (
  options: MovieSearchOptions,
): Promise<Search<Movie>> =>
  getCached(
    cacheKey("search:movie", options),
    TMDB_LIST_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().search.movies(options);
      } catch (error) {
        return handleTmdbError(error, "TMDB movie search failed");
      }
    },
  );

export const getTmdbPopularMovies = async (
  options: LanguageOption & PageOption = {},
): Promise<PopularMovies> =>
  getCached(
    cacheKey("popular:movie", options),
    TMDB_LIST_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().movies.popular(options);
      } catch (error) {
        return handleTmdbError(error, "TMDB popular movies request failed");
      }
    },
  );

export const discoverTmdbMovies = async (
  options?: MovieQueryOptions,
): Promise<MovieDiscoverResult> =>
  getCached(
    cacheKey("discover:movie", options),
    TMDB_DISCOVER_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().discover.movie(options);
      } catch (error) {
        return handleTmdbError(error, "TMDB discover request failed");
      }
    },
  );

export const getTmdbTrendingMovies = async (input?: {
  timeWindow?: TimeWindow;
  page?: number;
  language?: TmdbLanguage;
}) => {
  const normalized = {
    timeWindow: input?.timeWindow ?? "week",
    page: input?.page ?? 1,
    language: input?.language ?? toTmdbLanguage(),
  };

  return getCached(
    cacheKey("trending:movie", normalized),
    TMDB_LIST_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().trending.trending(
          "movie",
          normalized.timeWindow,
          {
            page: normalized.page,
            language: normalized.language,
          },
        );
      } catch (error) {
        return handleTmdbError(error, "TMDB trending movies request failed");
      }
    },
  );
};

export const getTmdbMovieRecommendations = async (
  input: TmdbMovieRelatedOptions,
): Promise<TmdbMovieRecommendationsResult> => {
  const {movieId, ...options} = input;
  return getCached(
    cacheKey("movie:recommendations", input),
    TMDB_RELATED_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().movies.recommendations(
          Number(movieId),
          options,
        );
      } catch (error) {
        return handleTmdbError(
          error,
          "TMDB movie recommendations request failed",
        );
      }
    },
  );
};

export const getTmdbSimilarMovies = async (
  input: TmdbMovieRelatedOptions,
): Promise<TmdbMovieSimilarResult> => {
  const {movieId, ...options} = input;
  return getCached(
    cacheKey("movie:similar", input),
    TMDB_RELATED_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().movies.similar(Number(movieId), options);
      } catch (error) {
        return handleTmdbError(error, "TMDB similar movies request failed");
      }
    },
  );
};

export const getTmdbMovieDetails = async (
  movieId: string | number,
  language: TmdbLanguage = toTmdbLanguage(),
): Promise<TmdbMovieDetailsWithAppends> =>
  getCached(
    cacheKey("movie:details", {movieId, language}),
    TMDB_MOVIE_DETAILS_CACHE_TTL_SECONDS,
    async () => {
      try {
        return await getTmdbClient().movies.details<MovieDetailsAppendKey[]>(
          Number(movieId),
          [...movieDetailsAppendKeys],
          language,
        );
      } catch (error) {
        return handleTmdbError(error, "TMDB movie request failed");
      }
    },
  );

export const getTmdbMovieGenres = async (options?: {language?: TmdbLanguage}) =>
  getCached(
    cacheKey("genres:movie", options ?? {}),
    TMDB_GENRE_CACHE_TTL_SECONDS,
    async () => {
      try {
        const response = await getTmdbClient().genres.movies(options);
        return response.genres;
      } catch (error) {
        return handleTmdbError(error, "TMDB genre request failed");
      }
    },
  );

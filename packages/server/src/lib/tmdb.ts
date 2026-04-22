import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@deckflix/shared";
import {createHash} from "node:crypto";
import {TMDB} from "tmdb-ts";
import {appEnv} from "../common/env";
import {ServiceException} from "../common/errors";
import type {
  PoolQueryFilters,
  PoolSourceMovie,
  PoolSourceMovieListResult,
  PoolSortOption,
} from "../games/game-pool.types";
import {ensureRedis, redis} from "./redis";

type TmdbSourceMovie = {
  id: number;
  title: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  release_date?: string | null;
  genre_ids?: number[];
  vote_count?: number | null;
  popularity?: number | null;
  original_language?: string | null;
};

export type TmdbMovieGenre = {
  id: number;
  name: string;
};

export type TmdbImageConfiguration = {
  secureBaseUrl: string;
  posterSizes: string[];
  backdropSizes: string[];
};

export type TmdbMovieImages = {
  movieId: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  posterOptions: string[];
  backdropOptions: string[];
};

const TMDB_GENRE_CACHE_TTL_SECONDS = 60 * 60 * 24;
const TMDB_CONFIGURATION_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const TMDB_DISCOVER_CACHE_TTL_SECONDS = 60 * 60 * 6;

const defaultImageConfiguration: TmdbImageConfiguration = {
  secureBaseUrl: appEnv.TMDB_IMAGE_BASE_URL.replace(/\/w\d+$/, "/"),
  posterSizes: ["w92", "w154", "w185", "w342", "w500", "w780", "original"],
  backdropSizes: ["w300", "w780", "w1280", "original"],
};

let tmdbClient: TMDB | null = null;

const ensureTmdbConfigured = () => {
  if (!appEnv.TMDB_API_KEY) {
    throw new ServiceException("TMDB is not configured");
  }
};

const getTmdbClient = () => {
  ensureTmdbConfigured();
  if (!tmdbClient) {
    tmdbClient = new TMDB(appEnv.TMDB_API_KEY!);
  }
  return tmdbClient;
};

const toYear = (releaseDate?: string | null) => {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isNaN(year) ? 0 : year;
};

const configurationCacheKey = () => "tmdb:configuration";

const genreCacheKey = (language: string) => `tmdb:genres:movie:${language}`;

const chooseImageSize = (availableSizes: string[], preferredSizes: string[]) =>
  preferredSizes.find((size) => availableSizes.includes(size)) ??
  availableSizes.at(-1) ??
  "original";

const buildImageUrlFromConfiguration = (
  configuration: TmdbImageConfiguration,
  path: string | null | undefined,
  size: string,
) => (path ? `${configuration.secureBaseUrl}${size}${path}` : null);

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

const toTmdbLanguage = (language?: string) => language as never;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashValue = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

const discoverCacheKey = (input: PoolQueryFilters & {language?: string}) =>
  `tmdb:discover:${hashValue(input)}`;

export const buildTmdbImageUrl = (path: string | null | undefined, size = "w500") =>
  path ? `${defaultImageConfiguration.secureBaseUrl}${size}${path}` : null;

const toMovieSummary = (movie: TmdbSourceMovie): MovieSummary => ({
  id: String(movie.id),
  title: movie.title,
  year: toYear(movie.release_date),
  overview: movie.overview ?? "",
  posterUrl: buildTmdbImageUrl(movie.poster_path) ?? "",
  rating: Number(movie.vote_average?.toFixed(1) ?? 0),
});

const toPoolSourceMovie = (movie: TmdbSourceMovie): PoolSourceMovie => ({
  ...toMovieSummary(movie),
  voteCount: movie.vote_count ?? 0,
  popularity: movie.popularity ?? 0,
  genreIds: movie.genre_ids ?? [],
  originalLanguage: movie.original_language ?? null,
});

export const getTmdbImageConfiguration = async (): Promise<TmdbImageConfiguration> => {
  await ensureRedis();
  const cacheKey = configurationCacheKey();
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as TmdbImageConfiguration;
  }

  try {
    const response = await getTmdbClient().configuration.getApiConfiguration();
    const configuration: TmdbImageConfiguration = {
      secureBaseUrl:
        response.images.secure_base_url || defaultImageConfiguration.secureBaseUrl,
      posterSizes:
        response.images.poster_sizes.length > 0
          ? response.images.poster_sizes
          : defaultImageConfiguration.posterSizes,
      backdropSizes:
        response.images.backdrop_sizes.length > 0
          ? response.images.backdrop_sizes
          : defaultImageConfiguration.backdropSizes,
    };

    await redis.set(cacheKey, JSON.stringify(configuration), {
      EX: TMDB_CONFIGURATION_CACHE_TTL_SECONDS,
    });

    return configuration;
  } catch (error) {
    return handleTmdbError(error, "TMDB configuration request failed");
  }
};

export const getTmdbMovieGenres = async (language = "en-US"): Promise<TmdbMovieGenre[]> => {
  await ensureRedis();
  const cacheKey = genreCacheKey(language);
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as TmdbMovieGenre[];
  }

  try {
    const response = await getTmdbClient().genres.movies({
      language: toTmdbLanguage(language),
    });
    await redis.set(cacheKey, JSON.stringify(response.genres), {
      EX: TMDB_GENRE_CACHE_TTL_SECONDS,
    });
    return response.genres;
  } catch (error) {
    return handleTmdbError(error, "TMDB genre request failed");
  }
};

export const searchTmdbMovies = async (input: {
  query: string;
  page?: number;
  language?: string;
}): Promise<MovieSearchResult> => {
  try {
    const response = await getTmdbClient().search.movies({
      query: input.query,
      page: input.page ?? 1,
      include_adult: false,
      language: toTmdbLanguage(input.language ?? "en-US"),
    });

    return {
      query: input.query,
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      items: response.results.map(toMovieSummary),
    };
  } catch (error) {
    return handleTmdbError(error, "TMDB movie search failed");
  }
};

export const getTmdbPopularMovies = async (input: {
  page?: number;
  language?: string;
}): Promise<MovieListResult> => {
  try {
    const response = await getTmdbClient().movies.popular({
      page: input.page ?? 1,
      language: toTmdbLanguage(input.language ?? "en-US"),
    });

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      items: response.results.map(toMovieSummary),
    };
  } catch (error) {
    return handleTmdbError(error, "TMDB popular movies request failed");
  }
};

export const discoverTmdbMovies = async (
  input: PoolQueryFilters & {language?: string},
): Promise<PoolSourceMovieListResult> => {
  await ensureRedis();
  const cacheKey = discoverCacheKey(input);
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PoolSourceMovieListResult;
  }

  try {
    const response = await getTmdbClient().discover.movie({
      page: input.page ?? 1,
      language: toTmdbLanguage(input.language ?? "en-US"),
      include_adult: false,
      sort_by: input.sortBy as PoolSortOption | undefined,
      with_genres: input.includedGenreIds?.length
        ? input.includedGenreIds.join("|")
        : undefined,
      without_genres: input.excludedGenreIds?.length
        ? input.excludedGenreIds.join(",")
        : undefined,
      primary_release_year: input.primaryReleaseYear,
      "primary_release_date.gte": input.primaryReleaseDateGte,
      "primary_release_date.lte": input.primaryReleaseDateLte,
      "vote_count.gte": input.voteCountGte,
      "vote_count.lte": input.voteCountLte,
      "vote_average.gte": input.voteAverageGte,
      "vote_average.lte": input.voteAverageLte,
      "with_runtime.gte": input.runtimeGte,
      "with_runtime.lte": input.runtimeLte,
      with_original_language: input.originalLanguage,
      region: input.region,
      watch_region: input.watchRegion,
      with_watch_providers: input.watchProviderIds?.length
        ? input.watchProviderIds.join("|")
        : undefined,
    });

    const result = {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      items: response.results.map(toPoolSourceMovie),
    };
    await redis.set(cacheKey, JSON.stringify(result), {
      EX: TMDB_DISCOVER_CACHE_TTL_SECONDS,
    });
    return result;
  } catch (error) {
    return handleTmdbError(error, "TMDB discover request failed");
  }
};

export const getTmdbMovieById = async (
  movieId: string,
  language = "en-US",
): Promise<MovieDetails | null> => {
  try {
    const movie = await getTmdbClient().movies.details(
      Number(movieId),
      undefined,
      toTmdbLanguage(language),
    );

    return {
      ...toMovieSummary(movie),
      releaseDate: movie.release_date ?? undefined,
      runtimeMinutes: movie.runtime ?? undefined,
      genres: movie.genres.map((genre) => genre.name),
    };
  } catch (error) {
    return handleTmdbError(error, "TMDB movie request failed");
  }
};

export const getTmdbMovieImages = async (
  movieId: string,
  language = "en-US",
): Promise<TmdbMovieImages> => {
  try {
    const tmdb = getTmdbClient();
    const [movie, images, configuration] = await Promise.all([
      tmdb.movies.details(Number(movieId), undefined, toTmdbLanguage(language)),
      tmdb.movies.images(Number(movieId), {
        language: toTmdbLanguage(language),
        include_image_language: [language, "null"],
      }),
      getTmdbImageConfiguration(),
    ]);
    const posterSize = chooseImageSize(configuration.posterSizes, [
      "w500",
      "w342",
      "original",
    ]);
    const backdropSize = chooseImageSize(configuration.backdropSizes, [
      "w1280",
      "w780",
      "original",
    ]);

    return {
      movieId,
      posterUrl: buildImageUrlFromConfiguration(configuration, movie.poster_path, posterSize),
      backdropUrl: buildImageUrlFromConfiguration(
        configuration,
        movie.backdrop_path,
        backdropSize,
      ),
      posterOptions: images.posters
        .map((item) =>
          buildImageUrlFromConfiguration(configuration, item.file_path, posterSize),
        )
        .filter(Boolean) as string[],
      backdropOptions: images.backdrops
        .map((item) =>
          buildImageUrlFromConfiguration(configuration, item.file_path, backdropSize),
        )
        .filter(Boolean) as string[],
    };
  } catch (error) {
    return handleTmdbError(error, "TMDB movie images request failed");
  }
};

export const isTmdbConfigured = () => Boolean(appEnv.TMDB_API_KEY);

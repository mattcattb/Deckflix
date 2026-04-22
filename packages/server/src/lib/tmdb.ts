import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@deckflix/shared";
import {TMDB} from "tmdb-ts";
import {appEnv} from "../common/env";
import {ServiceException} from "../common/errors";
import {ensureRedis, redis} from "./redis";

type TmdbSourceMovie = {
  id: number;
  title: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  release_date?: string | null;
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

export const discoverTmdbMovies = async (input: {
  page?: number;
  language?: string;
  genreIds?: number[];
  sortBy?: string;
  voteCountGte?: number;
  voteAverageGte?: number;
}): Promise<MovieListResult> => {
  try {
    const response = await getTmdbClient().discover.movie({
      page: input.page ?? 1,
      language: toTmdbLanguage(input.language ?? "en-US"),
      include_adult: false,
      sort_by: input.sortBy as
        | "first_air_date.asc"
        | "first_air_date.desc"
        | "popularity.asc"
        | "popularity.desc"
        | "release_date.asc"
        | "release_date.desc"
        | "revenue.asc"
        | "revenue.desc"
        | "primary_release_date.asc"
        | "primary_release_date.desc"
        | "original_title.asc"
        | "original_title.desc"
        | "vote_average.asc"
        | "vote_average.desc"
        | "vote_count.asc"
        | "vote_count.desc"
        | undefined,
      with_genres: input.genreIds?.length ? input.genreIds.join("|") : undefined,
      "vote_count.gte": input.voteCountGte,
      "vote_average.gte": input.voteAverageGte,
    });

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      items: response.results.map(toMovieSummary),
    };
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

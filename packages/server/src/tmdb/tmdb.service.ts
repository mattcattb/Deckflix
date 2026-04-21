import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@deckflix/shared";
import {appEnv} from "../common/env";
import {ServiceException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";

type TmdbSearchResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbMovie[];
};

type TmdbGenreListResponse = {
  genres: Array<{id: number; name: string}>;
};

type TmdbMovie = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  vote_average: number;
  release_date: string;
};

type TmdbMovieDetails = TmdbMovie & {
  genres: Array<{id: number; name: string}>;
  runtime: number | null;
};

type TmdbMovieImagesResponse = {
  id: number;
  backdrops: Array<{file_path: string; width: number; height: number}>;
  posters: Array<{file_path: string; width: number; height: number}>;
};

export type TmdbMovieGenre = {
  id: number;
  name: string;
};

export type TmdbMovieImages = {
  movieId: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  posterOptions: string[];
  backdropOptions: string[];
};

const TMDB_GENRE_CACHE_TTL_SECONDS = 60 * 60 * 24;

const ensureTmdbConfigured = () => {
  if (!appEnv.TMDB_API_KEY) {
    throw new ServiceException("TMDB is not configured");
  }
};

const toYear = (releaseDate?: string) => {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isNaN(year) ? 0 : year;
};

export const buildTmdbImageUrl = (path: string | null | undefined, size = "w500") =>
  path ? `${appEnv.TMDB_IMAGE_BASE_URL.replace(/\/w\d+$/, `/${size}`)}${path}` : null;

const toMovieSummary = (movie: TmdbMovie): MovieSummary => ({
  id: String(movie.id),
  title: movie.title,
  year: toYear(movie.release_date),
  overview: movie.overview ?? "",
  posterUrl: buildTmdbImageUrl(movie.poster_path) ?? "",
  rating: Number(movie.vote_average?.toFixed(1) ?? 0),
});

const fetchTmdb = async <T>(
  path: string,
  query: Record<string, string | undefined>,
): Promise<T> => {
  ensureTmdbConfigured();

  const url = new URL(path, appEnv.TMDB_BASE_URL);
  url.searchParams.set("api_key", appEnv.TMDB_API_KEY!);

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    throw new ServiceException("TMDB resource not found");
  }

  if (!response.ok) {
    throw new ServiceException("TMDB request failed", {
      status: response.status,
    });
  }

  return (await response.json()) as T;
};

const genreCacheKey = (language: string) => `tmdb:genres:movie:${language}`;

export const getTmdbMovieGenres = async (language = "en-US"): Promise<TmdbMovieGenre[]> => {
  await ensureRedis();
  const cacheKey = genreCacheKey(language);
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as TmdbMovieGenre[];
  }

  const response = await fetchTmdb<TmdbGenreListResponse>("/genre/movie/list", {
    language,
  });
  await redis.set(cacheKey, JSON.stringify(response.genres), {
    EX: TMDB_GENRE_CACHE_TTL_SECONDS,
  });

  return response.genres;
};

export const searchTmdbMovies = async (input: {
  query: string;
  page?: number;
  language?: string;
}): Promise<MovieSearchResult> => {
  const page = input.page ?? 1;
  const response = await fetchTmdb<TmdbSearchResponse>("/search/movie", {
    query: input.query,
    page: String(page),
    include_adult: "false",
    language: input.language ?? "en-US",
  });

  return {
    query: input.query,
    page: response.page,
    totalPages: response.total_pages,
    totalResults: response.total_results,
    items: response.results.map(toMovieSummary),
  };
};

export const getTmdbPopularMovies = async (input: {
  page?: number;
  language?: string;
}): Promise<MovieListResult> => {
  const page = input.page ?? 1;
  const response = await fetchTmdb<TmdbSearchResponse>("/movie/popular", {
    page: String(page),
    language: input.language ?? "en-US",
  });

  return {
    page: response.page,
    totalPages: response.total_pages,
    totalResults: response.total_results,
    items: response.results.map(toMovieSummary),
  };
};

export const discoverTmdbMovies = async (input: {
  page?: number;
  language?: string;
  genreIds?: number[];
  sortBy?: string;
  voteCountGte?: number;
  voteAverageGte?: number;
}): Promise<MovieListResult> => {
  const response = await fetchTmdb<TmdbSearchResponse>("/discover/movie", {
    page: String(input.page ?? 1),
    language: input.language ?? "en-US",
    include_adult: "false",
    sort_by: input.sortBy ?? "popularity.desc",
    with_genres: input.genreIds?.length ? input.genreIds.join("|") : undefined,
    "vote_count.gte": input.voteCountGte ? String(input.voteCountGte) : undefined,
    "vote_average.gte": input.voteAverageGte ? String(input.voteAverageGte) : undefined,
  });

  return {
    page: response.page,
    totalPages: response.total_pages,
    totalResults: response.total_results,
    items: response.results.map(toMovieSummary),
  };
};

export const getTmdbMovieById = async (
  movieId: string,
  language = "en-US",
): Promise<MovieDetails | null> => {
  const movie = await fetchTmdb<TmdbMovieDetails>(`/movie/${movieId}`, {
    language,
  });

  return {
    ...toMovieSummary(movie),
    releaseDate: movie.release_date ?? undefined,
    runtimeMinutes: movie.runtime ?? undefined,
    genres: movie.genres.map((genre) => genre.name),
  };
};

export const getTmdbMovieImages = async (
  movieId: string,
  language = "en-US",
): Promise<TmdbMovieImages> => {
  const [movie, images] = await Promise.all([
    fetchTmdb<TmdbMovie>(`/movie/${movieId}`, {language}),
    fetchTmdb<TmdbMovieImagesResponse>(`/movie/${movieId}/images`, {}),
  ]);

  return {
    movieId,
    posterUrl: buildTmdbImageUrl(movie.poster_path),
    backdropUrl: buildTmdbImageUrl(movie.backdrop_path, "original"),
    posterOptions: images.posters.map((item) => buildTmdbImageUrl(item.file_path)).filter(Boolean) as string[],
    backdropOptions: images.backdrops.map((item) => buildTmdbImageUrl(item.file_path, "original")).filter(Boolean) as string[],
  };
};

export const isTmdbConfigured = () => Boolean(appEnv.TMDB_API_KEY);

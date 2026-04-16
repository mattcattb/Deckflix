import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@deckflix/shared";
import {appEnv} from "../common/env";
import {ServiceException} from "../common/errors";

type TmdbSearchResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbMovie[];
};

type TmdbMovie = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  release_date: string;
};

type TmdbMovieDetails = TmdbMovie & {
  genres: Array<{id: number; name: string}>;
  runtime: number | null;
};

const toYear = (releaseDate?: string) => {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isNaN(year) ? 0 : year;
};

const toPosterUrl = (posterPath: string | null) =>
  posterPath ? `${appEnv.TMDB_IMAGE_BASE_URL}${posterPath}` : "";

const toMovieSummary = (movie: TmdbMovie): MovieSummary => ({
  id: String(movie.id),
  title: movie.title,
  year: toYear(movie.release_date),
  overview: movie.overview ?? "",
  posterUrl: toPosterUrl(movie.poster_path),
  rating: Number(movie.vote_average?.toFixed(1) ?? 0),
});

const fetchTmdb = async <T>(
  path: string,
  query: Record<string, string>,
): Promise<T> => {
  const apiKey = appEnv.TMDB_API_KEY;
  if (!apiKey) {
    throw new ServiceException("TMDB is not configured");
  }

  const url = new URL(path, appEnv.TMDB_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    throw new ServiceException("Movie not found");
  }

  if (!response.ok) {
    throw new ServiceException("TMDB request failed", {
      status: response.status,
    });
  }

  return (await response.json()) as T;
};

export const searchTmdbMovies = async (input: {
  query: string;
  page?: number;
}): Promise<MovieSearchResult> => {
  const page = input.page ?? 1;
  const response = await fetchTmdb<TmdbSearchResponse>("/search/movie", {
    query: input.query,
    page: String(page),
    include_adult: "false",
    language: "en-US",
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
}): Promise<MovieListResult> => {
  const page = input.page ?? 1;
  const response = await fetchTmdb<TmdbSearchResponse>("/movie/popular", {
    page: String(page),
    language: "en-US",
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
): Promise<MovieDetails | null> => {
  const movie = await fetchTmdb<TmdbMovieDetails>(`/movie/${movieId}`, {
    language: "en-US",
  });

  return {
    ...toMovieSummary(movie),
    releaseDate: movie.release_date ?? undefined,
    runtimeMinutes: movie.runtime ?? undefined,
    genres: movie.genres.map((genre) => genre.name),
  };
};

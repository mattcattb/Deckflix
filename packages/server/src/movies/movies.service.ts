import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@deckflix/shared";
import {z} from "zod";
import {appEnv} from "../common/env";
import {NotFoundException} from "../common/errors";
import {
  getTmdbMovieById,
  getTmdbPopularMovies,
  searchTmdbMovies,
} from "../lib/tmdb";
import {mockMovies, paginateMovies} from "./movies.mock";

export const movieSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

export const moviePopularQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

const toMovieSummary = (movie: MovieDetails): MovieSummary => ({
  id: movie.id,
  title: movie.title,
  year: movie.year,
  overview: movie.overview,
  posterUrl: movie.posterUrl,
  rating: movie.rating,
});

const hasTmdb = () => Boolean(appEnv.TMDB_API_KEY);

const useMockOnly = () => appEnv.MOVIE_PROVIDER === "mock";

const searchMockMovies = async (input: {
  query: string;
  page?: number;
}): Promise<MovieSearchResult> => {
  const page = input.page ?? 1;
  const needle = input.query.trim().toLowerCase();
  const filtered = mockMovies.filter((movie) => {
    if (movie.title.toLowerCase().includes(needle)) return true;
    if (movie.overview.toLowerCase().includes(needle)) return true;
    return movie.genres.some((genre) => genre.toLowerCase().includes(needle));
  });

  return {
    query: input.query,
    ...paginateMovies(filtered.map(toMovieSummary), page, 20),
  };
};

const getMockPopularMovies = async (input: {
  page?: number;
}): Promise<MovieListResult> => {
  const page = input.page ?? 1;
  const sorted = [...mockMovies]
    .sort((a, b) => b.rating - a.rating)
    .map(toMovieSummary);

  return paginateMovies(sorted, page, 20);
};

const getMockMovieById = async (movieId: string): Promise<MovieDetails | null> =>
  mockMovies.find((movie) => movie.id === movieId) ?? null;

export const searchMovies = async (input: {
  query: string;
  page?: number;
}): Promise<MovieSearchResult> => {
  if (useMockOnly() || !hasTmdb()) {
    return searchMockMovies(input);
  }

  try {
    return await searchTmdbMovies(input);
  } catch {
    return searchMockMovies(input);
  }
};

export const getPopularMovies = async (input: {
  page?: number;
}): Promise<MovieListResult> => {
  if (useMockOnly() || !hasTmdb()) {
    return getMockPopularMovies(input);
  }

  try {
    return await getTmdbPopularMovies(input);
  } catch {
    return getMockPopularMovies(input);
  }
};

export const getMovieById = async (movieId: string): Promise<MovieDetails> => {
  if (useMockOnly() || !hasTmdb()) {
    const movie = await getMockMovieById(movieId);
    if (!movie) throw new NotFoundException("Movie not found");
    return movie;
  }

  try {
    const movie = await getTmdbMovieById(movieId);
    if (!movie) throw new NotFoundException("Movie not found");
    return movie;
  } catch {
    const movie = await getMockMovieById(movieId);
    if (!movie) throw new NotFoundException("Movie not found");
    return movie;
  }
};

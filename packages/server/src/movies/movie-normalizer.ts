import type {MovieCandidate} from "@deckflix/shared";
import {buildTmdbImageUrl} from "../lib/tmdb";

type TmdbMovieCandidateInput = {
  id: number | string;
  title: string;
  release_date?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  vote_average?: number | null;
};

type TmdbMovieSourceInput = TmdbMovieCandidateInput & {
  vote_count?: number | null;
  popularity?: number | null;
  genre_ids?: number[] | null;
  original_language?: string | null;
};

export type MovieSourceCandidate = MovieCandidate & {
  releaseDate: string | null;
  voteCount: number;
  popularity: number;
  genreIds: number[];
  originalLanguage: string | null;
};

const toMovieYear = (releaseDate?: string | null) => {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isNaN(year) ? 0 : year;
};

export const toMovieCandidateFromTmdb = (
  movie: TmdbMovieCandidateInput,
): MovieCandidate => ({
  id: String(movie.id),
  title: movie.title,
  year: toMovieYear(movie.release_date),
  overview: movie.overview ?? "",
  posterUrl: buildTmdbImageUrl(movie.poster_path) ?? "",
  rating: Number(movie.vote_average?.toFixed(1) ?? 0),
});

export const toMovieSourceCandidateFromTmdb = (
  movie: TmdbMovieSourceInput,
): MovieSourceCandidate => ({
  ...toMovieCandidateFromTmdb(movie),
  releaseDate: movie.release_date ?? null,
  voteCount: movie.vote_count ?? 0,
  popularity: movie.popularity ?? 0,
  genreIds: movie.genre_ids ?? [],
  originalLanguage: movie.original_language ?? null,
});

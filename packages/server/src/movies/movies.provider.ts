import type { MovieDetails, MovieListResult, MovieSearchResult } from "@matty-stack/shared";

export interface MovieProvider {
  searchMovies(input: { query: string; page?: number }): Promise<MovieSearchResult>;
  getPopularMovies(input: { page?: number }): Promise<MovieListResult>;
  getMovieById(movieId: string): Promise<MovieDetails | null>;
}

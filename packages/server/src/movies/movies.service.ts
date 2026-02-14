import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
} from "@matty-stack/shared";
import { NotFoundException } from "../common/errors";
import { appEnv } from "../common/env";
import { MockMovieProvider } from "./movies.provider.mock";
import type { MovieProvider } from "./movies.provider";
import { TmdbMovieProvider } from "./movies.provider.tmdb";

const resolveProvider = (): MovieProvider => {
  const provider = appEnv.MOVIE_PROVIDER;
  const hasTmdb = Boolean(appEnv.TMDB_API_KEY);

  if (provider === "mock") {
    return new MockMovieProvider();
  }

  if (provider === "tmdb" && hasTmdb) {
    return new TmdbMovieProvider({
      apiKey: appEnv.TMDB_API_KEY!,
      baseUrl: appEnv.TMDB_BASE_URL,
      imageBaseUrl: appEnv.TMDB_IMAGE_BASE_URL,
    });
  }

  if (hasTmdb) {
    return new TmdbMovieProvider({
      apiKey: appEnv.TMDB_API_KEY!,
      baseUrl: appEnv.TMDB_BASE_URL,
      imageBaseUrl: appEnv.TMDB_IMAGE_BASE_URL,
    });
  }

  return new MockMovieProvider();
};

class MoviesService {
  private readonly provider: MovieProvider = resolveProvider();
  private readonly fallbackProvider = new MockMovieProvider();

  async searchMovies(input: {
    query: string;
    page?: number;
  }): Promise<MovieSearchResult> {
    try {
      return await this.provider.searchMovies(input);
    } catch {
      return this.fallbackProvider.searchMovies(input);
    }
  }

  async getPopularMovies(input: { page?: number }): Promise<MovieListResult> {
    try {
      return await this.provider.getPopularMovies(input);
    } catch {
      return this.fallbackProvider.getPopularMovies(input);
    }
  }

  async getMovieById(movieId: string): Promise<MovieDetails> {
    try {
      const movie = await this.provider.getMovieById(movieId);
      if (!movie) throw new NotFoundException("Movie not found");
      return movie;
    } catch {
      const fallbackMovie = await this.fallbackProvider.getMovieById(movieId);
      if (!fallbackMovie) throw new NotFoundException("Movie not found");
      return fallbackMovie;
    }
  }
}

export const moviesService = new MoviesService();

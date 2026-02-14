import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@matty-stack/shared";
import { ServiceException } from "../common/errors";
import type { MovieProvider } from "./movies.provider";

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
  genres: Array<{ id: number; name: string }>;
  runtime: number | null;
};

type TmdbConfig = {
  apiKey: string;
  baseUrl: string;
  imageBaseUrl: string;
};

const toYear = (releaseDate?: string) => {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isNaN(year) ? 0 : year;
};

const toPosterUrl = (imageBaseUrl: string, posterPath: string | null) =>
  posterPath ? `${imageBaseUrl}${posterPath}` : "";

const mapSummary = (imageBaseUrl: string, movie: TmdbMovie): MovieSummary => ({
  id: String(movie.id),
  title: movie.title,
  year: toYear(movie.release_date),
  overview: movie.overview ?? "",
  posterUrl: toPosterUrl(imageBaseUrl, movie.poster_path),
  rating: Number(movie.vote_average?.toFixed(1) ?? 0),
});

export class TmdbMovieProvider implements MovieProvider {
  constructor(private readonly config: TmdbConfig) {}

  async searchMovies(input: {
    query: string;
    page?: number;
  }): Promise<MovieSearchResult> {
    const page = input.page ?? 1;
    const response = await this.fetchTmdb<TmdbSearchResponse>("/search/movie", {
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
      items: response.results.map((movie) => mapSummary(this.config.imageBaseUrl, movie)),
    };
  }

  async getPopularMovies(input: { page?: number }): Promise<MovieListResult> {
    const page = input.page ?? 1;
    const response = await this.fetchTmdb<TmdbSearchResponse>("/movie/popular", {
      page: String(page),
      language: "en-US",
    });

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      items: response.results.map((movie) => mapSummary(this.config.imageBaseUrl, movie)),
    };
  }

  async getMovieById(movieId: string): Promise<MovieDetails | null> {
    const movie = await this.fetchTmdb<TmdbMovieDetails>(`/movie/${movieId}`, {
      language: "en-US",
    });

    return {
      ...mapSummary(this.config.imageBaseUrl, movie),
      releaseDate: movie.release_date ?? undefined,
      runtimeMinutes: movie.runtime ?? undefined,
      genres: movie.genres.map((genre) => genre.name),
    };
  }

  private async fetchTmdb<T>(
    path: string,
    query: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    url.searchParams.set("api_key", this.config.apiKey);
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
  }
}

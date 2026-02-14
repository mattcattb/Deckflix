import type {
  MovieDetails,
  MovieListResult,
  MovieSearchResult,
  MovieSummary,
} from "@matty-stack/shared";
import { mockMovies, paginateMovies } from "./movies.mock";
import type { MovieProvider } from "./movies.provider";

const toSummary = (movie: MovieDetails): MovieSummary => ({
  id: movie.id,
  title: movie.title,
  year: movie.year,
  overview: movie.overview,
  posterUrl: movie.posterUrl,
  rating: movie.rating,
});

export class MockMovieProvider implements MovieProvider {
  async searchMovies(input: {
    query: string;
    page?: number;
  }): Promise<MovieSearchResult> {
    const page = input.page ?? 1;
    const needle = input.query.trim().toLowerCase();
    const filtered = mockMovies.filter((movie) => {
      if (movie.title.toLowerCase().includes(needle)) return true;
      if (movie.overview.toLowerCase().includes(needle)) return true;
      return movie.genres.some((genre) => genre.toLowerCase().includes(needle));
    });
    const paged = paginateMovies(filtered.map(toSummary), page, 20);

    return {
      query: input.query,
      ...paged,
    };
  }

  async getPopularMovies(input: { page?: number }): Promise<MovieListResult> {
    const page = input.page ?? 1;
    const sorted = [...mockMovies]
      .sort((a, b) => b.rating - a.rating)
      .map(toSummary);

    return paginateMovies(sorted, page, 20);
  }

  async getMovieById(movieId: string): Promise<MovieDetails | null> {
    const movie = mockMovies.find((item) => item.id === movieId);
    return movie ?? null;
  }
}

export type MovieSummary = {
  id: string;
  title: string;
  year: number;
  overview: string;
  posterUrl: string;
  rating: number;
};

export type MovieDetails = MovieSummary & {
  releaseDate?: string;
  runtimeMinutes?: number;
  genres: string[];
};

export type MovieSearchResult = {
  query: string;
  page: number;
  totalPages: number;
  totalResults: number;
  items: MovieSummary[];
};

export type MovieListResult = {
  page: number;
  totalPages: number;
  totalResults: number;
  items: MovieSummary[];
};

export type MovieSummary = {
  id: string;
  title: string;
  year: number;
  overview: string;
  posterUrl: string;
  rating: number;
};

export type MoviePerson = {
  id: string;
  name: string;
  role: string;
};

export type MovieVideo = {
  id: string;
  name: string;
  site: string;
  type: string;
  url: string;
};

export type MovieWatchProvider = {
  id: number;
  name: string;
  logoUrl: string;
};

export type MovieProvider = MovieWatchProvider;

export type MovieGallery = {
  posters: string[];
  backdrops: string[];
  logos: string[];
};

export type MovieWatchAvailability = {
  region: string;
  link?: string;
  stream: MovieWatchProvider[];
  rent: MovieWatchProvider[];
  buy: MovieWatchProvider[];
};

export type MovieDetails = MovieSummary & {
  backdropUrl: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  genres: string[];
  tagline?: string;
  status?: string;
  contentRating?: string;
  originalTitle?: string;
  originalLanguage?: string;
  spokenLanguages: string[];
  productionCountries: string[];
  productionCompanies: string[];
  voteCount?: number;
  popularity?: number;
  budget?: number;
  revenue?: number;
  homepage?: string;
  imdbId?: string;
  directors: MoviePerson[];
  writers: MoviePerson[];
  cast: MoviePerson[];
  keywords: string[];
  trailers: MovieVideo[];
  gallery: MovieGallery;
  watchProviders: MovieWatchAvailability;
  belongsToCollection?: {
    id: string;
    name: string;
    posterUrl?: string;
    backdropUrl?: string;
  };
  recommendations: MovieSummary[];
  similar: MovieSummary[];
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

import type { MovieDetails, MovieSummary } from "@deckflix/shared";

const MOCK_MOVIES: MovieDetails[] = [
  {
    id: "movie-arrival",
    title: "Arrival",
    year: 2016,
    overview: "A linguist is recruited to communicate with visitors from space.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    rating: 7.9,
    releaseDate: "2016-11-11",
    runtimeMinutes: 116,
    genres: ["Sci-Fi", "Drama"],
  },
  {
    id: "movie-dune",
    title: "Dune",
    year: 2021,
    overview: "A young nobleman must survive a dangerous planet and destiny.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
    rating: 8.0,
    releaseDate: "2021-10-22",
    runtimeMinutes: 155,
    genres: ["Sci-Fi", "Adventure"],
  },
  {
    id: "movie-knives-out",
    title: "Knives Out",
    year: 2019,
    overview: "A detective investigates a wealthy family after a suspicious death.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg",
    rating: 7.9,
    releaseDate: "2019-11-27",
    runtimeMinutes: 131,
    genres: ["Mystery", "Comedy", "Crime"],
  },
  {
    id: "movie-the-batman",
    title: "The Batman",
    year: 2022,
    overview: "Batman uncovers corruption while hunting a serial killer.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    rating: 7.8,
    releaseDate: "2022-03-04",
    runtimeMinutes: 176,
    genres: ["Action", "Crime"],
  },
  {
    id: "movie-spiderverse",
    title: "Spider-Man: Into the Spider-Verse",
    year: 2018,
    overview: "Teen Miles Morales becomes Spider-Man across parallel worlds.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    rating: 8.4,
    releaseDate: "2018-12-14",
    runtimeMinutes: 117,
    genres: ["Animation", "Action"],
  },
];

export const mockMovies = MOCK_MOVIES;

export const paginateMovies = <T extends MovieSummary>(
  movies: T[],
  page: number,
  pageSize: number,
) => {
  const totalResults = movies.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const items = movies.slice(start, start + pageSize);

  return {
    page: clampedPage,
    totalPages,
    totalResults,
    items,
  };
};

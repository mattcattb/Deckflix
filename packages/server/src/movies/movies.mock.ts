import type { MovieDetails, MovieSummary } from "@deckflix/shared";

const movieDefaults: Omit<
  MovieDetails,
  | "id"
  | "title"
  | "year"
  | "overview"
  | "posterUrl"
  | "rating"
  | "releaseDate"
  | "runtimeMinutes"
  | "genres"
> = {
  backdropUrl: "",
  spokenLanguages: ["English"],
  productionCountries: ["United States of America"],
  productionCompanies: [],
  directors: [],
  writers: [],
  cast: [],
  keywords: [],
  trailers: [],
  gallery: {
    posters: [],
    backdrops: [],
    logos: [],
  },
  watchProviders: {
    region: "US",
    stream: [],
    rent: [],
    buy: [],
  },
  recommendations: [],
  similar: [],
};

const MOCK_MOVIES: MovieDetails[] = [
  {
    ...movieDefaults,
    id: "movie-arrival",
    title: "Arrival",
    year: 2016,
    overview: "A linguist is recruited to communicate with visitors from space.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    rating: 7.9,
    tagline: "Why are they here?",
    status: "Released",
    contentRating: "PG-13",
    productionCompanies: ["FilmNation Entertainment", "21 Laps Entertainment"],
    directors: [{id: "director-arrival", name: "Denis Villeneuve", role: "Director"}],
    writers: [
      {id: "writer-arrival-1", name: "Eric Heisserer", role: "Screenplay"},
      {id: "writer-arrival-2", name: "Ted Chiang", role: "Story"},
    ],
    cast: [
      {id: "cast-arrival-1", name: "Amy Adams", role: "Louise Banks"},
      {id: "cast-arrival-2", name: "Jeremy Renner", role: "Ian Donnelly"},
    ],
    keywords: ["aliens", "linguistics", "first contact"],
    releaseDate: "2016-11-11",
    runtimeMinutes: 116,
    genres: ["Sci-Fi", "Drama"],
  },
  {
    ...movieDefaults,
    id: "movie-dune",
    title: "Dune",
    year: 2021,
    overview: "A young nobleman must survive a dangerous planet and destiny.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
    rating: 8.0,
    tagline: "It begins.",
    status: "Released",
    contentRating: "PG-13",
    productionCompanies: ["Legendary Pictures", "Warner Bros. Pictures"],
    directors: [{id: "director-dune", name: "Denis Villeneuve", role: "Director"}],
    writers: [
      {id: "writer-dune-1", name: "Jon Spaihts", role: "Screenplay"},
      {id: "writer-dune-2", name: "Denis Villeneuve", role: "Screenplay"},
    ],
    cast: [
      {id: "cast-dune-1", name: "Timothee Chalamet", role: "Paul Atreides"},
      {id: "cast-dune-2", name: "Zendaya", role: "Chani"},
    ],
    keywords: ["desert planet", "prophecy", "space epic"],
    releaseDate: "2021-10-22",
    runtimeMinutes: 155,
    genres: ["Sci-Fi", "Adventure"],
  },
  {
    ...movieDefaults,
    id: "movie-knives-out",
    title: "Knives Out",
    year: 2019,
    overview: "A detective investigates a wealthy family after a suspicious death.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg",
    rating: 7.9,
    tagline: "Hell, any of them could have done it.",
    status: "Released",
    contentRating: "PG-13",
    productionCompanies: ["MRC", "T-Street"],
    directors: [{id: "director-knives-out", name: "Rian Johnson", role: "Director"}],
    writers: [{id: "writer-knives-out", name: "Rian Johnson", role: "Writer"}],
    cast: [
      {id: "cast-knives-out-1", name: "Daniel Craig", role: "Benoit Blanc"},
      {id: "cast-knives-out-2", name: "Ana de Armas", role: "Marta Cabrera"},
    ],
    keywords: ["whodunit", "family drama", "mansion mystery"],
    releaseDate: "2019-11-27",
    runtimeMinutes: 131,
    genres: ["Mystery", "Comedy", "Crime"],
  },
  {
    ...movieDefaults,
    id: "movie-the-batman",
    title: "The Batman",
    year: 2022,
    overview: "Batman uncovers corruption while hunting a serial killer.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    rating: 7.8,
    tagline: "Unmask the truth.",
    status: "Released",
    contentRating: "PG-13",
    productionCompanies: ["DC Films", "Warner Bros. Pictures"],
    directors: [{id: "director-batman", name: "Matt Reeves", role: "Director"}],
    writers: [
      {id: "writer-batman-1", name: "Matt Reeves", role: "Writer"},
      {id: "writer-batman-2", name: "Peter Craig", role: "Writer"},
    ],
    cast: [
      {id: "cast-batman-1", name: "Robert Pattinson", role: "Bruce Wayne / Batman"},
      {id: "cast-batman-2", name: "Zoe Kravitz", role: "Selina Kyle"},
    ],
    keywords: ["detective", "vigilante", "serial killer"],
    releaseDate: "2022-03-04",
    runtimeMinutes: 176,
    genres: ["Action", "Crime"],
  },
  {
    ...movieDefaults,
    id: "movie-spiderverse",
    title: "Spider-Man: Into the Spider-Verse",
    year: 2018,
    overview: "Teen Miles Morales becomes Spider-Man across parallel worlds.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    rating: 8.4,
    tagline: "More than one wears the mask.",
    status: "Released",
    contentRating: "PG",
    productionCompanies: ["Sony Pictures Animation", "Columbia Pictures"],
    directors: [
      {id: "director-spiderverse-1", name: "Bob Persichetti", role: "Director"},
      {id: "director-spiderverse-2", name: "Peter Ramsey", role: "Director"},
    ],
    writers: [
      {id: "writer-spiderverse-1", name: "Phil Lord", role: "Writer"},
      {id: "writer-spiderverse-2", name: "Rodney Rothman", role: "Writer"},
    ],
    cast: [
      {id: "cast-spiderverse-1", name: "Shameik Moore", role: "Miles Morales"},
      {id: "cast-spiderverse-2", name: "Jake Johnson", role: "Peter B. Parker"},
    ],
    keywords: ["multiverse", "superhero", "coming of age"],
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

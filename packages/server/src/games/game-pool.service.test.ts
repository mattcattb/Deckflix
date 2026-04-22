import {beforeEach, describe, expect, mock, test} from "bun:test";

const discoverTmdbMovies = mock();
const searchTmdbMovies = mock();
const getTmdbPopularMovies = mock();
const getTmdbMovieById = mock();
const getPopularMovies = mock();
const isTmdbConfigured = mock(() => true);
const ensureRedis = mock();
const setMovieRecord = mock();
const buildMovieDiscoveryFilters = mock(() => ({
  includedGenreIds: [28],
  excludedGenreIds: undefined,
  primaryReleaseDateGte: undefined,
  primaryReleaseDateLte: undefined,
  voteAverageGte: undefined,
  voteAverageLte: undefined,
  sortBy: "popularity.desc",
  voteCountGte: 50,
}));

mock.module(new URL("../lib/tmdb.ts", import.meta.url).href, () => ({
  discoverTmdbMovies,
  searchTmdbMovies,
  getTmdbPopularMovies,
  getTmdbMovieById,
  isTmdbConfigured,
}));
mock.module(new URL("../movies/movies.service.ts", import.meta.url).href, () => ({
  getPopularMovies,
}));
mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    del: mock(),
    zAdd: mock(),
    zRange: mock(),
    zCard: mock(),
  },
}));
mock.module(new URL("./game-redis.service.ts", import.meta.url).href, () => ({
  normalizeGameCode: (gameCode: string) => gameCode.trim().toUpperCase(),
  setMovieRecord,
}));
mock.module(new URL("../settings/game-settings.service.ts", import.meta.url).href, () => ({
  buildMovieDiscoveryFilters,
}));

const {buildInitialPool} = await import(new URL("./game-pool.service.ts", import.meta.url).href);

const settings = {
  gameplay: {
    minLikesToMatch: 2,
    maxMovies: 3,
    allowMaybe: true,
    allowSuperLike: true,
  },
  movieFilters: {
    includedGenreIds: [28],
    excludedGenreIds: [],
    primaryReleaseDateGte: null,
    primaryReleaseDateLte: null,
    voteAverageGte: null,
    voteAverageLte: null,
  },
};

beforeEach(() => {
  discoverTmdbMovies.mockReset();
  searchTmdbMovies.mockReset();
  getTmdbPopularMovies.mockReset();
  getTmdbMovieById.mockReset();
  getPopularMovies.mockReset();
  isTmdbConfigured.mockReset();
  ensureRedis.mockReset();
  setMovieRecord.mockReset();
  buildMovieDiscoveryFilters.mockReset();
  isTmdbConfigured.mockReturnValue(true);
  buildMovieDiscoveryFilters.mockReturnValue({
    includedGenreIds: [28],
    excludedGenreIds: undefined,
    primaryReleaseDateGte: undefined,
    primaryReleaseDateLte: undefined,
    voteAverageGte: undefined,
    voteAverageLte: undefined,
    sortBy: "popularity.desc",
    voteCountGte: 50,
  });
});

describe("game-pool.service", () => {
  test("buildInitialPool dedupes movies across TMDB pages and respects maxMovies", async () => {
    discoverTmdbMovies.mockImplementation(async ({page}: {page: number}) => ({
      page,
      totalPages: 2,
      totalResults: 4,
      items:
        page === 1
          ? [
            {
              id: "movie-a",
              title: "Movie A",
              year: 2020,
              overview: "A",
              posterUrl: "",
              rating: 7.1,
            },
            {
              id: "movie-b",
              title: "Movie B",
              year: 2021,
              overview: "B",
              posterUrl: "",
              rating: 7.2,
            },
          ]
          : [
            {
              id: "movie-b",
              title: "Movie B",
              year: 2021,
              overview: "B",
              posterUrl: "",
              rating: 7.2,
            },
            {
              id: "movie-c",
              title: "Movie C",
              year: 2022,
              overview: "C",
              posterUrl: "",
              rating: 7.3,
            },
          ],
    }));

    const result = await buildInitialPool({settings});

    expect(discoverTmdbMovies).toHaveBeenNthCalledWith(1, {
      page: 1,
      includedGenreIds: [28],
      excludedGenreIds: undefined,
      primaryReleaseDateGte: undefined,
      primaryReleaseDateLte: undefined,
      sortBy: "popularity.desc",
      voteCountGte: 50,
      voteAverageGte: undefined,
      voteAverageLte: undefined,
    });
    expect(result.map((movie: {id: string}) => movie.id)).toEqual([
      "movie-a",
      "movie-b",
      "movie-c",
    ]);
  });

  test("buildInitialPool falls back to popular movies when TMDB discover fails", async () => {
    discoverTmdbMovies.mockRejectedValueOnce(new Error("tmdb down"));
    getPopularMovies.mockResolvedValueOnce({
      page: 1,
      totalPages: 1,
      totalResults: 2,
      items: [
        {
          id: "popular-a",
          title: "Popular A",
          year: 2019,
          overview: "A",
          posterUrl: "",
          rating: 7.4,
        },
        {
          id: "popular-b",
          title: "Popular B",
          year: 2020,
          overview: "B",
          posterUrl: "",
          rating: 7.5,
        },
      ],
    });

    const result = await buildInitialPool({
      settings: {
        ...settings,
        gameplay: {
          ...settings.gameplay,
          maxMovies: 2,
        },
      },
    });

    expect(discoverTmdbMovies).toHaveBeenCalledTimes(1);
    expect(getPopularMovies).toHaveBeenCalledWith({page: 1});
    expect(result.map((movie: {id: string}) => movie.id)).toEqual([
      "popular-a",
      "popular-b",
    ]);
  });
});

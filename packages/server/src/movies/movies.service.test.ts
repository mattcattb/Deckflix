import {beforeEach, describe, expect, mock, test} from "bun:test";

const discoverTmdbMovies = mock();
const searchTmdbMovies = mock();
const getTmdbPopularMovies = mock();
const getTmdbMovieById = mock();
const getTmdbTrendingMovies = mock();
const getTmdbMovieRecommendations = mock();
const getTmdbSimilarMovies = mock();
const isTmdbConfigured = mock(() => true);

process.env.TMDB_API_KEY = "test-key";
delete process.env.MOVIE_PROVIDER;

mock.module(new URL("../lib/tmdb.ts", import.meta.url).href, () => ({
  discoverTmdbMovies,
  searchTmdbMovies,
  getTmdbPopularMovies,
  getTmdbMovieById,
  getTmdbTrendingMovies,
  getTmdbMovieRecommendations,
  getTmdbSimilarMovies,
  isTmdbConfigured,
}));

const {getMovieById, getPopularMovies, searchMovies} = await import(
  new URL("./movies.service.ts", import.meta.url).href
);

beforeEach(() => {
  discoverTmdbMovies.mockReset();
  searchTmdbMovies.mockReset();
  getTmdbPopularMovies.mockReset();
  getTmdbMovieById.mockReset();
  isTmdbConfigured.mockReset();
  isTmdbConfigured.mockReturnValue(true);
});

describe("movies.service", () => {
  test("searchMovies falls back to mock results when TMDB search fails", async () => {
    searchTmdbMovies.mockRejectedValueOnce(new Error("tmdb down"));

    const result = await searchMovies({query: "space"});

    expect(searchTmdbMovies).toHaveBeenCalledWith({query: "space"});
    expect(result.query).toBe("space");
    expect(result.items.map((movie: {id: string}) => movie.id)).toEqual([
      "movie-arrival",
    ]);
  });

  test("getPopularMovies prefers TMDB results when available", async () => {
    getTmdbPopularMovies.mockResolvedValueOnce({
      page: 2,
      totalPages: 8,
      totalResults: 160,
      items: [
        {
          id: "tmdb-1",
          title: "TMDB Hit",
          year: 2024,
          overview: "From TMDB",
          posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
          rating: 8.8,
        },
      ],
    });

    const result = await getPopularMovies({page: 2});

    expect(getTmdbPopularMovies).toHaveBeenCalledWith({page: 2});
    expect(result.items.map((movie: {id: string}) => movie.id)).toEqual([
      "tmdb-1",
    ]);
  });

  test("getMovieById falls back to the mock catalog when TMDB lookup fails", async () => {
    getTmdbMovieById.mockRejectedValueOnce(new Error("tmdb down"));

    const movie = await getMovieById("movie-dune");

    expect(getTmdbMovieById).toHaveBeenCalledWith("movie-dune");
    expect(movie.title).toBe("Dune");
    expect(movie.genres).toEqual(["Sci-Fi", "Adventure"]);
  });
});

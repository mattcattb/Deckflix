import {describe, expect, test} from "bun:test";
import {
  buildMovieDiscoveryFilters,
  DEFAULT_GAME_PREFERENCES,
  resolveGamePreferences,
} from "./preferences.service";

describe("game preferences", () => {
  test("resolves movie filter defaults", () => {
    expect(resolveGamePreferences()).toEqual(DEFAULT_GAME_PREFERENCES);
  });

  test("rejects invalid date, rating, and overlapping genre filters", () => {
    expect(() =>
      resolveGamePreferences({
        includedGenreIds: [28],
        excludedGenreIds: [28],
        primaryReleaseDateGte: "2025-01-01",
        primaryReleaseDateLte: "2024-01-01",
        voteAverageGte: 8.5,
        voteAverageLte: 7.5,
      }),
    ).toThrow();
  });

  test("maps preferences into tmdb discovery filters", () => {
    const filters = buildMovieDiscoveryFilters(
      resolveGamePreferences({
        popularityPreset: "popular",
        includedGenreIds: [28, 35],
        excludedGenreIds: [27],
        primaryReleaseDateGte: "2020-01-01",
        primaryReleaseDateLte: "2024-12-31",
        voteAverageGte: 6.5,
        voteAverageLte: 8.8,
      }),
    );

    expect(filters).toEqual({
      includedGenreIds: [28, 35],
      excludedGenreIds: [27],
      primaryReleaseDateGte: "2020-01-01",
      primaryReleaseDateLte: "2024-12-31",
      voteAverageGte: 6.5,
      voteAverageLte: 8.8,
    });
  });

  test("omits empty preferences from tmdb discovery mapping", () => {
    expect(buildMovieDiscoveryFilters(DEFAULT_GAME_PREFERENCES)).toEqual({
      includedGenreIds: undefined,
      excludedGenreIds: undefined,
      primaryReleaseDateGte: undefined,
      primaryReleaseDateLte: undefined,
      voteAverageGte: undefined,
      voteAverageLte: undefined,
    });
  });
});

import {describe, expect, test} from "bun:test";
import {
  buildMovieDiscoveryOptions,
  DEFAULT_GAME_PREFERENCES,
  resolveGamePreferences,
} from "./room-preferences.service";

describe("game preferences", () => {
  test("resolves movie filter defaults", () => {
    expect(resolveGamePreferences()).toEqual(DEFAULT_GAME_PREFERENCES);
  });

  test("rejects invalid date, rating, and overlapping genre filters", () => {
    expect(() =>
      resolveGamePreferences({
        includedGenreIds: [28],
        excludedGenreIds: [28],
        preferredProviderIds: [8],
        primaryReleaseDateGte: "2025-01-01",
        primaryReleaseDateLte: "2024-01-01",
        voteAverageGte: 8.5,
        voteAverageLte: 7.5,
      }),
    ).toThrow();
  });

  test("maps preferences into tmdb discovery filters", () => {
    const filters = buildMovieDiscoveryOptions(
      resolveGamePreferences({
        popularityPreset: "popular",
        includedGenreIds: [28, 35],
        excludedGenreIds: [27],
        preferredProviderIds: [8, 337],
        watchRegion: "US",
        primaryReleaseDateGte: "2020-01-01",
        primaryReleaseDateLte: "2024-12-31",
        voteAverageGte: 6.5,
        voteAverageLte: 8.8,
      }),
    );

    expect(filters).toEqual({
      with_genres: "28|35",
      without_genres: "27",
      watch_region: "US",
      with_watch_providers: "8|337",
      "primary_release_date.gte": "2020-01-01",
      "primary_release_date.lte": "2024-12-31",
      "vote_average.gte": 6.5,
      "vote_average.lte": 8.8,
    });
  });

  test("omits empty preferences from tmdb discovery mapping", () => {
    expect(buildMovieDiscoveryOptions(DEFAULT_GAME_PREFERENCES)).toEqual({
      with_genres: undefined,
      without_genres: undefined,
      watch_region: undefined,
      with_watch_providers: undefined,
      "primary_release_date.gte": undefined,
      "primary_release_date.lte": undefined,
      "vote_average.gte": undefined,
      "vote_average.lte": undefined,
    });
  });
});

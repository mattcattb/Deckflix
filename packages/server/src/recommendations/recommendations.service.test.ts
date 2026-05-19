import {describe, expect, test} from "bun:test";
import {DEFAULT_GAME_SETTINGS} from "../rooms/room-settings.service";
import * as RecommendationEngine from "./recommendation-engine";

describe("recommendations.service", () => {
  test("plans deterministic source strategies for a seed", () => {
    const first = RecommendationEngine.planRecommendationQueries(
      DEFAULT_GAME_SETTINGS,
      "seed-1",
    );
    const second = RecommendationEngine.planRecommendationQueries(
      DEFAULT_GAME_SETTINGS,
      "seed-1",
    );

    expect(first.strategies.map((strategy) => strategy.id)).toEqual(
      second.strategies.map((strategy) => strategy.id),
    );
    expect(first.strategies.some((strategy) => strategy.source === "discover")).toBe(true);
    expect(first.strategies.some((strategy) => strategy.source === "trending")).toBe(true);
    expect(first.strategies.some((strategy) => strategy.source === "recommendation")).toBe(true);
  });

  test("selects a final pool without duplicate movies", () => {
    const movies = RecommendationEngine.selectRecommendedMovies(
      Array.from({length: 8}, (_, index) => ({
        movie: {
          id: `movie-${index}`,
          title: `Movie ${index}`,
          year: 2000 + index,
          overview: "",
          posterUrl: "",
          rating: 7,
        },
        primarySourceFamily: "discover" as const,
        sourceHits: [{
          sourceFamily: "discover" as const,
          strategyId: "discover-broad",
          page: 1,
          weight: 0.25,
        }],
        discoveredPages: [1],
        features: {
          year: 2000 + index,
          releaseDate: `${2000 + index}-01-01`,
          rating: 7,
          voteCount: 100 + index,
          popularity: 20 + index,
          genreIds: [index + 1],
          dominantGenreId: index + 1,
          originalLanguage: "en",
        },
        scores: {
          filterFit: 1,
          quality: 1,
          freshness: 1,
          novelty: 1,
          diversityPotential: 1,
          source: 1,
          recentHistoryPenalty: 0,
          final: 1 - index * 0.01,
        },
      })),
      {
        ...DEFAULT_GAME_SETTINGS,
        gameplay: {
          ...DEFAULT_GAME_SETTINGS.gameplay,
          maxMovies: 5,
        },
      },
      "selection-seed",
    );

    expect(movies).toHaveLength(5);
    expect(new Set(movies.map((movie) => movie.id)).size).toBe(movies.length);
  });
});

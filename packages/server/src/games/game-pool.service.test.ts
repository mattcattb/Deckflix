import {beforeEach, describe, expect, mock, test} from "bun:test";

const discoverTmdbMovies = mock();
const getTmdbTrendingMovies = mock();
const getTmdbMovieRecommendations = mock();
const getTmdbSimilarMovies = mock();
const getPopularMovies = mock();
const isTmdbConfigured = mock(() => true);
const ensureRedis = mock();
const setMovieRecord = mock();
const redisGet = mock((key: string) =>
  key.includes(":pool:seed") ? "seed-1" : null,
);
const redisSet = mock();
const redisKeys = mock(() => []);
const redisDel = mock();
const redisZAdd = mock();
const redisZRange = mock();
const redisZCard = mock();
const redisZScore = mock(() => null);
const redisZRemRangeByScore = mock();
const buildMovieDiscoveryFilters = mock(() => ({
  includedGenreIds: [28],
  excludedGenreIds: undefined,
  primaryReleaseDateGte: undefined,
  primaryReleaseDateLte: undefined,
  voteAverageGte: undefined,
  voteAverageLte: undefined,
}));

mock.module(new URL("../lib/tmdb.ts", import.meta.url).href, () => ({
  discoverTmdbMovies,
  getTmdbTrendingMovies,
  getTmdbMovieRecommendations,
  getTmdbSimilarMovies,
  isTmdbConfigured,
}));
mock.module(new URL("../movies/movies.service.ts", import.meta.url).href, () => ({
  getPopularMovies,
}));
mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    get: redisGet,
    set: redisSet,
    keys: redisKeys,
    del: redisDel,
    zAdd: redisZAdd,
    zRange: redisZRange,
    zCard: redisZCard,
    zScore: redisZScore,
    zRemRangeByScore: redisZRemRangeByScore,
  },
}));
mock.module(new URL("./game-redis.service.ts", import.meta.url).href, () => ({
  normalizeGameCode: (gameCode: string) => gameCode.trim().toUpperCase(),
  setMovieRecord,
}));
mock.module(new URL("../settings/game-settings.service.ts", import.meta.url).href, () => ({
  buildMovieDiscoveryFilters,
}));

const GamePoolService = await import(new URL("./game-pool.service.ts", import.meta.url).href);

const settings = {
  gameplay: {
    minLikesToMatch: 2,
    maxMovies: 6,
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

const buildMovie = (
  id: string,
  input?: Partial<{
    year: number;
    releaseDate: string | null;
    rating: number;
    voteCount: number;
    popularity: number;
    genreIds: number[];
    originalLanguage: string;
  }>,
) => ({
  id,
  title: id,
  year: input?.year ?? 2020,
  releaseDate: input?.releaseDate ?? `${input?.year ?? 2020}-01-01`,
  overview: id,
  posterUrl: "",
  rating: input?.rating ?? 7.1,
  voteCount: input?.voteCount ?? 100,
  popularity: input?.popularity ?? 40,
  genreIds: input?.genreIds ?? [28],
  originalLanguage: input?.originalLanguage ?? "en",
});

beforeEach(() => {
  discoverTmdbMovies.mockReset();
  getTmdbTrendingMovies.mockReset();
  getTmdbMovieRecommendations.mockReset();
  getTmdbSimilarMovies.mockReset();
  getPopularMovies.mockReset();
  isTmdbConfigured.mockReset();
  ensureRedis.mockReset();
  setMovieRecord.mockReset();
  redisGet.mockReset();
  redisSet.mockReset();
  redisKeys.mockReset();
  redisDel.mockReset();
  redisZAdd.mockReset();
  redisZRange.mockReset();
  redisZCard.mockReset();
  redisZScore.mockReset();
  redisZRemRangeByScore.mockReset();
  buildMovieDiscoveryFilters.mockReset();

  isTmdbConfigured.mockReturnValue(true);
  redisGet.mockImplementation((key: string) =>
    key.includes(":pool:seed") ? "seed-1" : null,
  );
  redisKeys.mockReturnValue([]);
  redisZScore.mockReturnValue(null);
  buildMovieDiscoveryFilters.mockReturnValue({
    includedGenreIds: [28],
    excludedGenreIds: undefined,
    primaryReleaseDateGte: undefined,
    primaryReleaseDateLte: undefined,
    voteAverageGte: undefined,
    voteAverageLte: undefined,
  });
});

describe("game-pool.service", () => {
  test("planPoolQueries is deterministic for the same seed and varies with different seeds", () => {
    const first = GamePoolService.planPoolQueries(settings, "seed-a");
    const second = GamePoolService.planPoolQueries(settings, "seed-a");
    const third = GamePoolService.planPoolQueries(settings, "seed-b");

    expect(first.strategies).toEqual(second.strategies);
    expect(third.strategies).not.toEqual(first.strategies);
    expect(first.selectionSalt).toBeUndefined();
  });

  test("fetchPoolCandidates uses discover page bands plus trending and expansions", async () => {
    discoverTmdbMovies.mockImplementation(async ({page}: {page: number}) => ({
      page,
      totalPages: 80,
      totalResults: 1000,
      items: [
        buildMovie(`discover-${page}`, {
          year: 2000 + page,
          popularity: 20 + page,
          voteCount: 40 + page,
          genreIds: page % 2 === 0 ? [28] : [12],
        }),
        buildMovie("discover-shared", {
          year: 2020,
          popularity: 85,
          voteCount: 800,
          genreIds: [28],
        }),
      ],
    }));
    getTmdbTrendingMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 20,
      items: [
        buildMovie("trending-a", {
          year: 2025,
          popularity: 90,
          voteCount: 200,
          genreIds: [28],
        }),
      ],
    });
    getTmdbMovieRecommendations.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 20,
      items: [
        buildMovie("recommendation-a", {
          year: 2021,
          popularity: 55,
          voteCount: 300,
          genreIds: [12],
        }),
      ],
    });
    getTmdbSimilarMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 20,
      items: [
        buildMovie("similar-a", {
          year: 2019,
          popularity: 45,
          voteCount: 250,
          genreIds: [35],
        }),
      ],
    });

    const plan = GamePoolService.planPoolQueries(settings, "seed-a");
    const result = await GamePoolService.fetchPoolCandidates(plan, settings);

    expect(result.some((candidate: {movie: {id: string}}) => candidate.movie.id === "trending-a")).toBe(
      true,
    );
    expect(
      result.some((candidate: {movie: {id: string}}) => candidate.movie.id === "recommendation-a"),
    ).toBe(true);
    expect(result.some((candidate: {movie: {id: string}}) => candidate.movie.id === "similar-a")).toBe(
      true,
    );
    expect(new Set(result.map((candidate: {movie: {id: string}}) => candidate.movie.id)).size).toBe(
      result.length,
    );

    const discoverPages = discoverTmdbMovies.mock.calls.map((call: any[]) => call[0].page);
    expect(discoverPages.some((page: number) => page > 1)).toBe(true);
    expect(discoverPages.some((page: number) => page >= 16)).toBe(true);
  });

  test("scorePoolCandidates applies recent history penalties", () => {
    const candidates = [
      {
        movie: {
          id: "fresh-movie",
          title: "Fresh Movie",
          year: 2024,
          overview: "fresh",
          posterUrl: "",
          rating: 7.5,
        },
        primarySourceFamily: "discover",
        sourceHits: [
          {
            sourceFamily: "discover",
            strategyId: "discover-broad",
            page: 2,
            weight: 0.25,
          },
        ],
        discoveredPages: [2],
        features: {
          year: 2024,
          releaseDate: "2024-02-10",
          rating: 7.5,
          voteCount: 400,
          popularity: 55,
          genreIds: [28],
          dominantGenreId: 28,
          originalLanguage: "en",
        },
        scores: {
          filterFit: 0,
          quality: 0,
          freshness: 0,
          novelty: 0,
          diversityPotential: 0,
          source: 0,
          recentHistoryPenalty: 0,
          final: 0,
        },
      },
      {
        movie: {
          id: "recently-served",
          title: "Recently Served",
          year: 2024,
          overview: "repeat",
          posterUrl: "",
          rating: 7.5,
        },
        primarySourceFamily: "discover",
        sourceHits: [
          {
            sourceFamily: "discover",
            strategyId: "discover-broad",
            page: 3,
            weight: 0.25,
          },
        ],
        discoveredPages: [3],
        features: {
          year: 2024,
          releaseDate: "2024-01-01",
          rating: 7.5,
          voteCount: 400,
          popularity: 55,
          genreIds: [28],
          dominantGenreId: 28,
          originalLanguage: "en",
        },
        scores: {
          filterFit: 0,
          quality: 0,
          freshness: 0,
          novelty: 0,
          diversityPotential: 0,
          source: 0,
          recentHistoryPenalty: 0,
          final: 0,
        },
      },
    ];

    const scored = GamePoolService.scorePoolCandidates(
      candidates,
      settings,
      new Map([
        ["fresh-movie", null],
        ["recently-served", Date.now()],
      ]),
    );

    expect(scored[0].movie.id).toBe("fresh-movie");
    expect(
      scored.find((candidate: {movie: {id: string}}) => candidate.movie.id === "recently-served")
        ?.scores.recentHistoryPenalty,
    ).toBeGreaterThan(0);
  });

  test("selectFinalPool uses weighted selection with mix constraints", () => {
    const candidates = [
      ["discover-1", "discover", 0.9, 90, 28, 2024],
      ["discover-2", "discover", 0.88, 88, 28, 2023],
      ["discover-3", "discover", 0.86, 87, 28, 2022],
      ["trending-1", "trending", 0.82, 70, 12, 2025],
      ["recommendation-1", "recommendation", 0.8, 45, 35, 2019],
      ["similar-1", "similar", 0.78, 40, 18, 2010],
      ["discover-4", "discover", 0.76, 30, 80, 1995],
      ["trending-2", "trending", 0.74, 68, 53, 2021],
    ].map(([id, family, final, popularity, genreId, year]) => ({
      movie: {
        id,
        title: id,
        year,
        overview: id,
        posterUrl: "",
        rating: 7.4,
      },
      primarySourceFamily: family,
      sourceHits: [
        {
          sourceFamily: family,
          strategyId: `${family}-strategy`,
          page: family === "discover" ? 10 : 1,
          weight: 0.2,
        },
      ],
      discoveredPages: [family === "discover" ? 10 : 1],
      features: {
        year,
        releaseDate: `${year}-01-01`,
        rating: 7.4,
        voteCount: 300,
        popularity,
        genreIds: [genreId],
        dominantGenreId: genreId,
        originalLanguage: "en",
      },
      scores: {
        filterFit: 1,
        quality: 0.8,
        freshness: 0.7,
        novelty: 0.7,
        diversityPotential: 0.7,
        source: 0.7,
        recentHistoryPenalty: 0,
        final,
      },
    }));

    const movies = GamePoolService.selectFinalPool(candidates, settings, "salt-a");

    expect(movies).toHaveLength(settings.gameplay.maxMovies);
    expect(
      movies.filter((movie: {id: string}) => movie.id.startsWith("discover-")).length,
    ).toBeLessThanOrEqual(3);
    expect(
      new Set(
        movies.map((movie: {id: string}) => movie.id.split("-")[0]),
      ).size,
    ).toBeGreaterThanOrEqual(3);
  });

  test("buildInitialPool saves artifacts and tolerates expansion failures", async () => {
    discoverTmdbMovies.mockImplementation(async ({page}: {page: number}) => ({
      page,
      totalPages: 30,
      totalResults: 600,
      items: [
        buildMovie(`discover-${page}`, {
          year: 2000 + page,
          popularity: 30 + page,
          voteCount: 100 + page,
          genreIds: page % 2 === 0 ? [28] : [12],
        }),
      ],
    }));
    getTmdbTrendingMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 20,
      items: [
        buildMovie("trending-hit", {
          year: 2025,
          popularity: 95,
          voteCount: 220,
          genreIds: [28],
        }),
      ],
    });
    getTmdbMovieRecommendations.mockRejectedValue(new Error("recommendations down"));
    getTmdbSimilarMovies.mockRejectedValue(new Error("similar down"));

    const result = await GamePoolService.buildInitialPool({
      gameCode: "room-1",
      settings,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(redisSet).toHaveBeenCalled();
    const planWrite = redisSet.mock.calls.find((call: any[]) => call[0].includes(":pool:plan"));
    expect(planWrite?.[1]).toContain("selectionSalt");
  });

  test("saveInitialPool updates recent history and stores records", async () => {
    await GamePoolService.saveInitialPool("room-1", [
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
    ]);

    expect(redisZAdd).toHaveBeenCalledTimes(2);
    expect(redisZRemRangeByScore).toHaveBeenCalledTimes(1);
    expect(setMovieRecord).toHaveBeenCalledTimes(2);
  });
});

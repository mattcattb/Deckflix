import {beforeEach, describe, expect, mock, test} from "bun:test";

const discoverTmdbMovies = mock();
const searchTmdbMovies = mock();
const getTmdbPopularMovies = mock();
const getTmdbMovieById = mock();
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
    get: redisGet,
    set: redisSet,
    keys: redisKeys,
    del: redisDel,
    zAdd: redisZAdd,
    zRange: redisZRange,
    zCard: redisZCard,
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

const buildMovie = (
  id: string,
  input?: Partial<{
    year: number;
    rating: number;
    voteCount: number;
    popularity: number;
    genreIds: number[];
  }>,
) => ({
  id,
  title: id,
  year: input?.year ?? 2020,
  overview: id,
  posterUrl: "",
  rating: input?.rating ?? 7.1,
  voteCount: input?.voteCount ?? 100,
  popularity: input?.popularity ?? 40,
  genreIds: input?.genreIds ?? [28],
  originalLanguage: "en",
});

beforeEach(() => {
  discoverTmdbMovies.mockReset();
  searchTmdbMovies.mockReset();
  getTmdbPopularMovies.mockReset();
  getTmdbMovieById.mockReset();
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
  buildMovieDiscoveryFilters.mockReset();

  isTmdbConfigured.mockReturnValue(true);
  redisGet.mockImplementation((key: string) =>
    key.includes(":pool:seed") ? "seed-1" : null,
  );
  redisKeys.mockReturnValue([]);
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
  test("planPoolQueries is deterministic for the same seed and different for different seeds", () => {
    const first = GamePoolService.planPoolQueries(settings, "seed-a");
    const second = GamePoolService.planPoolQueries(settings, "seed-a");
    const third = GamePoolService.planPoolQueries(settings, "seed-b");

    expect(first.variants).toEqual(second.variants);
    expect(first.variants).not.toEqual(third.variants);
    expect(
      new Set(
        first.variants.map((variant: {filters: {sortBy?: string}}) => variant.filters.sortBy),
      ).size,
    ).toBeGreaterThan(1);
  });

  test("buildInitialPool samples bounded pages, dedupes candidates, and respects maxMovies", async () => {
    discoverTmdbMovies.mockImplementation(async ({sortBy, page}: {sortBy?: string; page: number}) => ({
      page,
      totalPages: 25,
      totalResults: 100,
      items: [
        buildMovie("duplicate-movie", {
          year: 2020,
          rating: 7.8,
          popularity: 80,
          voteCount: 500,
          genreIds: [28],
        }),
        buildMovie(`${sortBy ?? "unknown"}-${page}`, {
          year: 2000 + page,
          rating: 6 + page / 10,
          popularity: 20 + page,
          voteCount: 40 + page,
          genreIds: page % 2 === 0 ? [28] : [12],
        }),
      ],
    }));

    const result = await GamePoolService.buildInitialPool({
      gameCode: "room-1",
      settings,
    });

    expect(result).toHaveLength(3);
    expect(new Set(result.map((movie: {id: string}) => movie.id)).size).toBe(3);
    expect(discoverTmdbMovies.mock.calls.length).toBeGreaterThan(4);
    for (const [input] of discoverTmdbMovies.mock.calls) {
      expect(input.page).toBeGreaterThanOrEqual(1);
      expect(input.page).toBeLessThanOrEqual(12);
    }
    expect(redisSet).toHaveBeenCalled();
    expect(redisZAdd).toHaveBeenCalled();
  });

  test("scorePoolCandidates is stable for the same seed", () => {
    const candidates = [
      {
        movie: {
          id: "movie-a",
          title: "Movie A",
          year: 2020,
          overview: "A",
          posterUrl: "",
          rating: 7.4,
        },
        sourceVariantIds: ["broad-popular"],
        discoveredPages: [1],
        features: {
          year: 2020,
          rating: 7.4,
          voteCount: 300,
          popularity: 70,
          genreIds: [28],
          dominantGenreId: 28,
          originalLanguage: "en",
        },
        scores: {
          relevance: 0,
          quality: 0,
          popularity: 0,
          diversity: 0,
          jitter: 0,
          final: 0,
        },
      },
    ];

    expect(
      GamePoolService.scorePoolCandidates(candidates, settings, "seed-a"),
    ).toEqual(GamePoolService.scorePoolCandidates(candidates, settings, "seed-a"));
  });

  test("selectFinalPool applies diversity caps before filling deferred candidates", () => {
    const candidates = [
      "movie-a",
      "movie-b",
      "movie-c",
      "movie-d",
    ].map((id, index) => ({
      movie: {
        id,
        title: id,
        year: index < 3 ? 1990 + index : 2015,
        overview: id,
        posterUrl: "",
        rating: 7.5 - index * 0.1,
      },
      sourceVariantIds: ["broad-popular"],
      discoveredPages: [1],
      features: {
        year: index < 3 ? 1990 + index : 2015,
        rating: 7.5 - index * 0.1,
        voteCount: 300,
        popularity: index < 3 ? 80 : 30,
        genreIds: index < 3 ? [28] : [35],
        dominantGenreId: index < 3 ? 28 : 35,
        originalLanguage: "en",
      },
      scores: {
        relevance: 1,
        quality: 0.8,
        popularity: 0.8,
        diversity: 0.5,
        jitter: 0,
        final: 0.9 - index * 0.05,
      },
    }));

    const result = GamePoolService.selectFinalPool(candidates, settings);
    expect(result).toHaveLength(3);
    expect(result.some((movie: {id: string}) => movie.id === "movie-d")).toBe(true);
  });

  test("buildInitialPool falls back to popular movies when discover fails", async () => {
    discoverTmdbMovies.mockRejectedValue(new Error("tmdb down"));
    getPopularMovies.mockResolvedValue({
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

    const result = await GamePoolService.buildInitialPool({
      gameCode: "room-1",
      settings: {
        ...settings,
        gameplay: {
          ...settings.gameplay,
          maxMovies: 2,
        },
      },
    });

    expect(getPopularMovies).toHaveBeenCalledWith({page: 1});
    expect(result.map((movie: {id: string}) => movie.id).sort()).toEqual([
      "popular-a",
      "popular-b",
    ]);
  });
});

import type {GameSettings, MovieCandidate} from "@deckflix/shared";
import {createHash, randomUUID} from "node:crypto";
import {BadRequestException, NotFoundException} from "../common/errors";
import {
  discoverTmdbMovies,
  getTmdbMovieRecommendations,
  getTmdbSimilarMovies,
  getTmdbTrendingMovies,
} from "../lib/tmdb";
import {ensureRedis, redis} from "../lib/redis";
import * as MoviesService from "../movies/movies.service";
import * as GameSettingsService from "../settings/game-settings.service";
import type * as SwipeQueueService from "../swipe/swipe-queue.service";
import * as GameRedisService from "./game-redis.service";
import type {
  PoolBuildResult,
  PoolCandidateRecord,
  PoolPlan,
  PoolQueryFilters,
  PoolSeedContext,
  PoolSourceFamily,
  PoolSourceHit,
  PoolSourceMovie,
  PoolStrategy,
  PoolTimeWindow,
} from "./game-pool.types";

const poolKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool`;
const poolSeedKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool:seed`;
const poolPlanKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool:plan`;
const poolCandidatesKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool:candidates`;
const poolCandidateKey = (gameCode: string, movieId: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool:candidate:${movieId}`;
const poolCandidatePattern = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:pool:candidate:*`;
const recentPoolHistoryKey = () => "pool:recent-history";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RECENT_HISTORY_TTL_MS = 14 * DAY_IN_MS;
const HIGH_POPULARITY_THRESHOLD = 65;
const MIN_SELECTION_WEIGHT = 0.001;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashValue = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

const numberFromSeed = (seed: string) => Number.parseInt(hashValue(seed).slice(0, 8), 16);

const createSeededRandom = (seed: string) => {
  let state = numberFromSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const pickInt = (seed: string, min: number, max: number) => {
  if (max <= min) {
    return min;
  }

  return min + Math.floor(createSeededRandom(seed)() * (max - min + 1));
};

const maybeApplyDateWindow = (
  filters: PoolQueryFilters,
  startYear: number,
  endYear: number,
): PoolQueryFilters => {
  if (filters.primaryReleaseDateGte || filters.primaryReleaseDateLte) {
    return filters;
  }

  return {
    ...filters,
    primaryReleaseDateGte: `${startYear}-01-01`,
    primaryReleaseDateLte: `${endYear}-12-31`,
  };
};

const samplePagesInBand = (
  totalPages: number,
  pageSampleSize: number,
  seed: string,
  start: number,
  end: number,
) => {
  const lower = Math.max(1, start);
  const upper = Math.max(lower, Math.min(totalPages, end));
  const availablePages = upper - lower + 1;
  const targetSize = Math.max(1, Math.min(pageSampleSize, availablePages));
  const random = createSeededRandom(seed);
  const pages = new Set<number>();

  while (pages.size < targetSize) {
    const candidate = lower + Math.floor(random() * availablePages);
    pages.add(candidate);
  }

  return [...pages].sort((left, right) => left - right);
};

const dominantGenreId = (genreIds: number[]) => genreIds[0] ?? null;

const toPoolSourceMovie = (movie: MovieCandidate): PoolSourceMovie => ({
  ...movie,
  releaseDate: null,
  voteCount: 0,
  popularity: 0,
  genreIds: [],
  originalLanguage: null,
});

const getPrimarySourceFamily = (sourceHits: PoolSourceHit[]): PoolSourceFamily => {
  const totals = new Map<PoolSourceFamily, number>();
  for (const hit of sourceHits) {
    totals.set(hit.sourceFamily, (totals.get(hit.sourceFamily) ?? 0) + hit.weight);
  }

  return [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "discover";
};

const createSourceHit = (
  strategy: PoolStrategy,
  page: number,
  anchorMovieId?: string,
): PoolSourceHit => ({
  sourceFamily: strategy.sourceFamily,
  strategyId: strategy.id,
  page,
  weight: strategy.weight,
  ...(anchorMovieId ? {anchorMovieId} : {}),
});

const toCandidateRecord = (movie: PoolSourceMovie, sourceHit: PoolSourceHit): PoolCandidateRecord => ({
  movie: {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    overview: movie.overview,
    posterUrl: movie.posterUrl,
    rating: movie.rating,
  },
  primarySourceFamily: sourceHit.sourceFamily,
  sourceHits: [sourceHit],
  discoveredPages: [sourceHit.page],
  features: {
    year: movie.year,
    releaseDate: movie.releaseDate,
    rating: movie.rating,
    voteCount: movie.voteCount,
    popularity: movie.popularity,
    genreIds: movie.genreIds,
    dominantGenreId: dominantGenreId(movie.genreIds),
    originalLanguage: movie.originalLanguage,
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
});

const mergeSourceHits = (existingHits: PoolSourceHit[], nextHit: PoolSourceHit) => {
  const duplicate = existingHits.some((hit) =>
    hit.sourceFamily === nextHit.sourceFamily &&
    hit.strategyId === nextHit.strategyId &&
    hit.page === nextHit.page &&
    hit.anchorMovieId === nextHit.anchorMovieId,
  );

  return duplicate ? existingHits : [...existingHits, nextHit];
};

const mergeCandidateRecord = (
  current: PoolCandidateRecord,
  movie: PoolSourceMovie,
  sourceHit: PoolSourceHit,
): PoolCandidateRecord => {
  const sourceHits = mergeSourceHits(current.sourceHits, sourceHit);
  return {
    ...current,
    movie: current.movie.rating >= movie.rating ? current.movie : {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      rating: movie.rating,
    },
    primarySourceFamily: getPrimarySourceFamily(sourceHits),
    sourceHits,
    discoveredPages: [...new Set([...current.discoveredPages, sourceHit.page])].sort(
      (left, right) => left - right,
    ),
    features: {
      year: current.features.year || movie.year,
      releaseDate: current.features.releaseDate ?? movie.releaseDate,
      rating: Math.max(current.features.rating, movie.rating),
      voteCount: Math.max(current.features.voteCount, movie.voteCount),
      popularity: Math.max(current.features.popularity, movie.popularity),
      genreIds: current.features.genreIds.length > 0
        ? current.features.genreIds
        : movie.genreIds,
      dominantGenreId:
        current.features.dominantGenreId ?? dominantGenreId(movie.genreIds),
      originalLanguage: current.features.originalLanguage ?? movie.originalLanguage,
    },
  };
};

const mergeCandidates = (
  candidates: Map<string, PoolCandidateRecord>,
  items: PoolSourceMovie[],
  strategy: PoolStrategy,
  page: number,
  anchorMovieId?: string,
) => {
  const sourceHit = createSourceHit(strategy, page, anchorMovieId);

  for (const movie of items) {
    const current = candidates.get(movie.id);
    if (current) {
      candidates.set(movie.id, mergeCandidateRecord(current, movie, sourceHit));
      continue;
    }

    candidates.set(movie.id, toCandidateRecord(movie, sourceHit));
  }
};

const getSettingsFingerprint = (settings: GameSettings) => hashValue(settings).slice(0, 16);

const fetchDiscoverStrategy = async (
  strategy: PoolStrategy,
  seed: string,
) => {
  const probePage = strategy.pageBandStart ?? 1;
  const filters = strategy.filters ?? {};
  const probe = await discoverTmdbMovies({
    ...filters,
    page: probePage,
  });
  const bandStart = strategy.pageBandStart ?? probePage;
  const bandEnd = strategy.pageBandEnd ?? probe.totalPages;
  const pages = samplePagesInBand(
    probe.totalPages,
    strategy.pageSampleSize ?? 1,
    `${seed}:${strategy.id}`,
    bandStart,
    bandEnd,
  );

  const pageResults = await Promise.all(
    [...new Set([...pages, probePage])].map(async (page) => {
      if (page === probePage) {
        return {
          page,
          items: probe.items,
        };
      }

      const result = await discoverTmdbMovies({
        ...filters,
        page,
      });
      return {
        page,
        items: result.items,
      };
    }),
  );

  return pageResults;
};

const fetchTrendingStrategy = async (strategy: PoolStrategy) => {
  const result = await getTmdbTrendingMovies({
    timeWindow: (strategy.timeWindow ?? "week") as PoolTimeWindow,
    page: 1,
  });
  return [
    {
      page: 1,
      items: result.items,
    },
  ];
};

const fetchRecommendationStrategy = async (anchorMovieId: string) => {
  const result = await getTmdbMovieRecommendations({
    movieId: anchorMovieId,
    page: 1,
  });
  return [
    {
      page: 1,
      items: result.items,
    },
  ];
};

const fetchSimilarStrategy = async (anchorMovieId: string) => {
  const result = await getTmdbSimilarMovies({
    movieId: anchorMovieId,
    page: 1,
  });
  return [
    {
      page: 1,
      items: result.items,
    },
  ];
};

const fetchPopularFallback = async (page: number) => {
  const result = await MoviesService.getPopularMovies({page});
  return {
    page,
    items: result.items.map(toPoolSourceMovie),
    totalPages: result.totalPages,
  };
};

const scoreFilterFit = (candidate: PoolCandidateRecord, filters: PoolQueryFilters) => {
  let checks = 0;
  let score = 0;

  if (filters.includedGenreIds?.length) {
    checks += 1;
    const overlap = candidate.features.genreIds.filter((genreId) =>
      filters.includedGenreIds?.includes(genreId),
    );
    score += overlap.length / filters.includedGenreIds.length;
  }

  if (filters.excludedGenreIds?.length) {
    checks += 1;
    const overlap = candidate.features.genreIds.some((genreId) =>
      filters.excludedGenreIds?.includes(genreId),
    );
    score += overlap ? 0 : 1;
  }

  if (filters.primaryReleaseDateGte || filters.primaryReleaseDateLte) {
    checks += 1;
    const releaseDate = candidate.features.releaseDate ?? `${candidate.features.year}-01-01`;
    const withinLower =
      !filters.primaryReleaseDateGte || releaseDate >= filters.primaryReleaseDateGte;
    const withinUpper =
      !filters.primaryReleaseDateLte || releaseDate <= filters.primaryReleaseDateLte;
    score += withinLower && withinUpper ? 1 : 0;
  }

  if (filters.voteAverageGte != null || filters.voteAverageLte != null) {
    checks += 1;
    const withinLower =
      filters.voteAverageGte == null || candidate.features.rating >= filters.voteAverageGte;
    const withinUpper =
      filters.voteAverageLte == null || candidate.features.rating <= filters.voteAverageLte;
    score += withinLower && withinUpper ? 1 : 0;
  }

  return checks === 0 ? 1 : score / checks;
};

const scoreQuality = (candidate: PoolCandidateRecord) => {
  const ratingScore = clamp(candidate.features.rating / 10);
  const voteScore = clamp(Math.log10(candidate.features.voteCount + 1) / 4);
  return ratingScore * 0.72 + voteScore * 0.28;
};

const scoreFreshness = (candidate: PoolCandidateRecord) => {
  const familySet = new Set(candidate.sourceHits.map((hit) => hit.sourceFamily));
  const releaseYear = candidate.features.year;
  const currentYear = new Date().getUTCFullYear();
  const yearDelta = releaseYear > 0 ? Math.max(0, currentYear - releaseYear) : 30;
  const releaseScore =
    yearDelta <= 1 ? 1
    : yearDelta <= 3 ? 0.8
    : yearDelta <= 7 ? 0.55
    : 0.3;
  const sourceBonus =
    (familySet.has("trending") ? 0.35 : 0) +
    (familySet.has("recommendation") ? 0.22 : 0) +
    (familySet.has("similar") ? 0.15 : 0);
  const popularitySupport = clamp(Math.log10(candidate.features.popularity + 1) / 3.5);
  return clamp(releaseScore * 0.65 + sourceBonus + popularitySupport * 0.15);
};

const scoreNovelty = (candidate: PoolCandidateRecord) => {
  const familyCount = new Set(candidate.sourceHits.map((hit) => hit.sourceFamily)).size;
  const averagePage =
    candidate.sourceHits.reduce((total, hit) => total + hit.page, 0) /
    candidate.sourceHits.length;
  const familyBase =
    familyCount <= 1 ? 0.55
    : familyCount === 2 ? 0.85
    : familyCount === 3 ? 0.5
    : 0.25;
  const pageDepthScore = clamp((averagePage - 1) / 40);
  const popularityPenalty = clamp(candidate.features.popularity / 140);
  return clamp(familyBase + pageDepthScore * 0.2 - popularityPenalty * 0.15);
};

const scoreDiversityPotential = (candidate: PoolCandidateRecord) => {
  const genreBreadth = clamp(candidate.features.genreIds.length / 4);
  const pageDepth =
    candidate.sourceHits.reduce((total, hit) => total + hit.page, 0) /
    candidate.sourceHits.length;
  const pageDepthScore = clamp((pageDepth - 1) / 50);
  const lowPopularityBonus = 1 - clamp(candidate.features.popularity / 110);
  return genreBreadth * 0.35 + pageDepthScore * 0.3 + lowPopularityBonus * 0.35;
};

const scoreSource = (candidate: PoolCandidateRecord) => {
  const totalWeight = candidate.sourceHits.reduce((total, hit) => total + hit.weight, 0);
  const familyCount = new Set(candidate.sourceHits.map((hit) => hit.sourceFamily)).size;
  const anchorBoost = candidate.sourceHits.some((hit) => hit.anchorMovieId) ? 0.1 : 0;
  return clamp(totalWeight / 0.5) * 0.8 + clamp((familyCount - 1) / 3) * 0.1 + anchorBoost;
};

const scoreRecentHistoryPenalty = (lastServedAtMs?: number | null) => {
  if (!lastServedAtMs) {
    return 0;
  }

  const ageMs = Date.now() - lastServedAtMs;
  if (ageMs <= DAY_IN_MS) {
    return 1;
  }
  if (ageMs <= 7 * DAY_IN_MS) {
    return 0.6;
  }
  if (ageMs <= 14 * DAY_IN_MS) {
    return 0.3;
  }
  return 0;
};

const clearStoredCandidates = async (gameCode: string) => {
  await ensureRedis();
  const keys = await redis.keys(poolCandidatePattern(gameCode));
  const deletions = [poolPlanKey(gameCode), poolCandidatesKey(gameCode), ...keys];
  if (deletions.length === 0) {
    return;
  }

  await redis.del(deletions);
};

const savePoolArtifacts = async (gameCode: string, buildResult: PoolBuildResult) => {
  await ensureRedis();
  await clearStoredCandidates(gameCode);
  await redis.set(poolPlanKey(gameCode), JSON.stringify(buildResult.plan));

  if (buildResult.candidates.length > 0) {
    await redis.zAdd(
      poolCandidatesKey(gameCode),
      buildResult.candidates.map((candidate) => ({
        value: candidate.movie.id,
        score: candidate.scores.final,
      })),
    );

    for (const candidate of buildResult.candidates) {
      await redis.set(
        poolCandidateKey(gameCode, candidate.movie.id),
        JSON.stringify(candidate),
      );
    }
  }
};

const listBaseStrategies = (plan: PoolPlan) =>
  plan.strategies.filter((strategy) =>
    strategy.source === "discover" || strategy.source === "trending",
  );

const listExpansionStrategies = (plan: PoolPlan) =>
  plan.strategies.filter((strategy) =>
    strategy.source === "recommendation" || strategy.source === "similar",
  );

const selectExpansionAnchors = (
  candidates: PoolCandidateRecord[],
  anchorLimit: number,
) => {
  const anchors: PoolCandidateRecord[] = [];
  const usedGenres = new Set<number>();
  const usedDecades = new Set<number>();

  for (const candidate of candidates) {
    if (anchors.length >= anchorLimit) {
      break;
    }

    const genre = candidate.features.dominantGenreId;
    const decade = Math.floor(candidate.features.year / 10);
    const distinctGenre = genre == null || !usedGenres.has(genre);
    const distinctDecade = !usedDecades.has(decade);

    if (!distinctGenre && !distinctDecade) {
      continue;
    }

    anchors.push(candidate);
    if (genre != null) {
      usedGenres.add(genre);
    }
    usedDecades.add(decade);
  }

  if (anchors.length >= anchorLimit) {
    return anchors;
  }

  for (const candidate of candidates) {
    if (anchors.length >= anchorLimit) {
      break;
    }
    if (anchors.some((anchor) => anchor.movie.id === candidate.movie.id)) {
      continue;
    }
    anchors.push(candidate);
  }

  return anchors;
};

const getRecentHistoryTimestamps = async (movieIds: string[]) => {
  await ensureRedis();
  await redis.zRemRangeByScore(recentPoolHistoryKey(), 0, Date.now() - RECENT_HISTORY_TTL_MS);

  const scores = await Promise.all(
    movieIds.map(async (movieId) => {
      const value = await redis.zScore(recentPoolHistoryKey(), movieId);
      return [movieId, value == null ? null : Number(value)] as const;
    }),
  );

  return new Map(scores);
};

const scoreBaseCandidatesForAnchors = (
  candidates: PoolCandidateRecord[],
  settings: GameSettings,
) => {
  const filters = GameSettingsService.buildMovieDiscoveryFilters(settings);

  return [...candidates]
    .map((candidate) => {
      const filterFit = scoreFilterFit(candidate, filters);
      const quality = scoreQuality(candidate);
      const freshness = scoreFreshness(candidate);
      const novelty = scoreNovelty(candidate);
      const anchorScore = filterFit * 0.42 + quality * 0.34 + freshness * 0.14 + novelty * 0.10;
      return {
        ...candidate,
        scores: {
          ...candidate.scores,
          final: anchorScore,
        },
      };
    })
    .sort((left, right) => right.scores.final - left.scores.final);
};

const toSelectionWindowSize = (maxMovies: number) =>
  Math.min(Math.max(maxMovies * 3, 120), 320);

const getSelectionCaps = (maxMovies: number) => ({
  maxConsecutivePerDecade: 2,
  maxConsecutivePerGenre: 2,
  maxPerSourceFamily: Math.max(1, Math.floor(maxMovies * 0.35)),
  maxHighPopularity: Math.max(1, Math.floor(maxMovies * 0.4)),
});

type SelectionRelaxation = {
  enforceDecade: boolean;
  enforceGenre: boolean;
  enforceSourceFamily: boolean;
  enforceHighPopularity: boolean;
};

const selectionRelaxations: SelectionRelaxation[] = [
  {
    enforceDecade: true,
    enforceGenre: true,
    enforceSourceFamily: true,
    enforceHighPopularity: true,
  },
  {
    enforceDecade: false,
    enforceGenre: true,
    enforceSourceFamily: true,
    enforceHighPopularity: true,
  },
  {
    enforceDecade: false,
    enforceGenre: false,
    enforceSourceFamily: true,
    enforceHighPopularity: true,
  },
  {
    enforceDecade: false,
    enforceGenre: false,
    enforceSourceFamily: false,
    enforceHighPopularity: true,
  },
  {
    enforceDecade: false,
    enforceGenre: false,
    enforceSourceFamily: false,
    enforceHighPopularity: false,
  },
];

const isHighPopularity = (candidate: PoolCandidateRecord) =>
  candidate.features.popularity >= HIGH_POPULARITY_THRESHOLD;

const passesSelectionConstraints = (
  candidate: PoolCandidateRecord,
  selected: PoolCandidateRecord[],
  caps: ReturnType<typeof getSelectionCaps>,
  relaxation: SelectionRelaxation,
) => {
  const recent = selected.slice(-caps.maxConsecutivePerDecade);
  const decade = Math.floor(candidate.features.year / 10);

  if (
    relaxation.enforceDecade &&
    recent.length >= caps.maxConsecutivePerDecade &&
    recent.every((item) => Math.floor(item.features.year / 10) === decade)
  ) {
    return false;
  }

  if (
    relaxation.enforceGenre &&
    candidate.features.dominantGenreId &&
    recent.length >= caps.maxConsecutivePerGenre &&
    recent.every((item) => item.features.dominantGenreId === candidate.features.dominantGenreId)
  ) {
    return false;
  }

  if (relaxation.enforceSourceFamily) {
    const sourceFamilyCount = selected.filter((item) =>
      item.primarySourceFamily === candidate.primarySourceFamily,
    ).length;
    if (sourceFamilyCount >= caps.maxPerSourceFamily) {
      return false;
    }
  }

  if (relaxation.enforceHighPopularity && isHighPopularity(candidate)) {
    const highPopularityCount = selected.filter(isHighPopularity).length;
    if (highPopularityCount >= caps.maxHighPopularity) {
      return false;
    }
  }

  return true;
};

const drawWeightedCandidate = (
  candidates: PoolCandidateRecord[],
  random: () => number,
) => {
  const weights = candidates.map((candidate) =>
    Math.max(MIN_SELECTION_WEIGHT, Math.exp(candidate.scores.final * 4)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;

  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      return candidates[index];
    }
  }

  return candidates.at(-1) ?? null;
};

const updateRecentPoolHistory = async (movies: MovieCandidate[]) => {
  if (movies.length === 0) {
    return;
  }

  await ensureRedis();
  const now = Date.now();
  await redis.zAdd(
    recentPoolHistoryKey(),
    movies.map((movie) => ({
      value: movie.id,
      score: now,
    })),
  );
  await redis.zRemRangeByScore(recentPoolHistoryKey(), 0, now - RECENT_HISTORY_TTL_MS);
};

export const createPoolSeed = () => randomUUID();

export const setPoolSeed = async (context: PoolSeedContext) => {
  await ensureRedis();
  await redis.set(poolSeedKey(context.gameCode), context.seed);
};

export const getPoolSeedOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const seed = await redis.get(poolSeedKey(gameCode));
  if (!seed) {
    throw new NotFoundException(
      `Pool seed missing for game ${GameRedisService.normalizeGameCode(gameCode)}`,
    );
  }

  return seed;
};

export const planPoolQueries = (settings: GameSettings, seed: string): PoolPlan => {
  const baseFilters = GameSettingsService.buildMovieDiscoveryFilters(settings);
  const currentYear = new Date().getUTCFullYear();
  const deepCutStart = pickInt(`${seed}:deep:start`, 1982, Math.max(1982, currentYear - 18));
  const deepCutEnd = Math.min(deepCutStart + 8, currentYear - 3);

  return {
    version: 2,
    seed,
    generatedAt: new Date().toISOString(),
    settingsFingerprint: getSettingsFingerprint(settings),
    strategies: [
      {
        id: "discover-broad",
        label: "Discover Broad",
        source: "discover",
        sourceFamily: "discover",
        weight: 0.25,
        pageSampleSize: 2,
        pageBandStart: 1,
        pageBandEnd: 3,
        filters: {
          ...baseFilters,
          sortBy: "popularity.desc",
          voteCountGte: 50,
        },
      },
      {
        id: "discover-mid-depth",
        label: "Discover Mid Depth",
        source: "discover",
        sourceFamily: "discover",
        weight: 0.2,
        pageSampleSize: 3,
        pageBandStart: 4,
        pageBandEnd: 15,
        filters: {
          ...baseFilters,
          sortBy: "vote_average.desc",
          voteCountGte: 120,
          voteAverageGte: Math.max(baseFilters.voteAverageGte ?? 0, 6.2),
        },
      },
      {
        id: "discover-deep-cut",
        label: "Discover Deep Cut",
        source: "discover",
        sourceFamily: "discover",
        weight: 0.2,
        pageSampleSize: 4,
        pageBandStart: 16,
        pageBandEnd: 80,
        filters: maybeApplyDateWindow(
          {
            ...baseFilters,
            sortBy: "vote_count.desc",
            voteCountGte: 15,
            voteCountLte: 1500,
          },
          deepCutStart,
          deepCutEnd,
        ),
      },
      {
        id: "trending-weekly",
        label: "Trending Weekly",
        source: "trending",
        sourceFamily: "trending",
        weight: 0.1,
        timeWindow: "week",
      },
      {
        id: "recommendation-expansion",
        label: "Recommendation Expansion",
        source: "recommendation",
        sourceFamily: "recommendation",
        weight: 0.15,
        anchorLimit: 3,
      },
      {
        id: "similar-expansion",
        label: "Similar Expansion",
        source: "similar",
        sourceFamily: "similar",
        weight: 0.1,
        anchorLimit: 3,
      },
    ],
  };
};

export const fetchPoolCandidates = async (
  plan: PoolPlan,
  settings: GameSettings,
) => {
  const candidates = new Map<string, PoolCandidateRecord>();
  const baseStrategies = listBaseStrategies(plan);
  let discoverSuccessCount = 0;

  for (const strategy of baseStrategies) {
    try {
      const pageResults =
        strategy.source === "discover"
          ? await fetchDiscoverStrategy(strategy, plan.seed)
          : await fetchTrendingStrategy(strategy);
      for (const pageResult of pageResults) {
        mergeCandidates(candidates, pageResult.items, strategy, pageResult.page);
      }
      if (strategy.source === "discover") {
        discoverSuccessCount += 1;
      }
    } catch {
      continue;
    }
  }

  const provisionalAnchors = selectExpansionAnchors(
    scoreBaseCandidatesForAnchors([...candidates.values()], settings),
    3,
  );

  for (const strategy of listExpansionStrategies(plan)) {
    const anchors = provisionalAnchors.slice(0, strategy.anchorLimit ?? 3);
    for (const anchor of anchors) {
      try {
        const pageResults =
          strategy.source === "recommendation"
            ? await fetchRecommendationStrategy(anchor.movie.id)
            : await fetchSimilarStrategy(anchor.movie.id);
        for (const pageResult of pageResults) {
          mergeCandidates(
            candidates,
            pageResult.items,
            strategy,
            pageResult.page,
            anchor.movie.id,
          );
        }
      } catch {
        continue;
      }
    }
  }

  if (candidates.size === 0 || (discoverSuccessCount === 0 && candidates.size < settings.gameplay.maxMovies)) {
    try {
      const fallback = await fetchPopularFallback(1);
      const popularStrategy: PoolStrategy = {
        id: "popular-fallback",
        label: "Popular Fallback",
        source: "popular",
        sourceFamily: "popular",
        weight: 0.08,
      };
      mergeCandidates(candidates, fallback.items, popularStrategy, fallback.page);
    } catch {
      // Keep the existing failure path below.
    }
  }

  return [...candidates.values()];
};

export const scorePoolCandidates = (
  candidates: PoolCandidateRecord[],
  settings: GameSettings,
  recentHistoryTimestamps = new Map<string, number | null>(),
) => {
  const filters = GameSettingsService.buildMovieDiscoveryFilters(settings);

  return candidates
    .map((candidate) => {
      const filterFit = scoreFilterFit(candidate, filters);
      const quality = scoreQuality(candidate);
      const freshness = scoreFreshness(candidate);
      const novelty = scoreNovelty(candidate);
      const diversityPotential = scoreDiversityPotential(candidate);
      const source = scoreSource(candidate);
      const recentHistoryPenalty = scoreRecentHistoryPenalty(
        recentHistoryTimestamps.get(candidate.movie.id),
      );
      const final =
        filterFit * 0.28 +
        quality * 0.20 +
        freshness * 0.12 +
        novelty * 0.16 +
        diversityPotential * 0.10 +
        source * 0.08 -
        recentHistoryPenalty * 0.14;

      return {
        ...candidate,
        primarySourceFamily: getPrimarySourceFamily(candidate.sourceHits),
        scores: {
          filterFit,
          quality,
          freshness,
          novelty,
          diversityPotential,
          source,
          recentHistoryPenalty,
          final,
        },
      };
    })
    .sort((left, right) => right.scores.final - left.scores.final);
};

export const selectFinalPool = (
  candidates: PoolCandidateRecord[],
  settings: GameSettings,
  selectionSalt: string,
) => {
  const maxMovies = settings.gameplay.maxMovies;
  const windowSize = toSelectionWindowSize(maxMovies);
  const caps = getSelectionCaps(maxMovies);
  const remaining = [...candidates.slice(0, windowSize)];
  const selected: PoolCandidateRecord[] = [];
  const random = createSeededRandom(selectionSalt);

  while (selected.length < maxMovies && remaining.length > 0) {
    let pickedCandidate: PoolCandidateRecord | null = null;

    for (const relaxation of selectionRelaxations) {
      const eligible = remaining.filter((candidate) =>
        passesSelectionConstraints(candidate, selected, caps, relaxation),
      );
      if (eligible.length === 0) {
        continue;
      }

      pickedCandidate = drawWeightedCandidate(eligible, random);
      if (pickedCandidate) {
        break;
      }
    }

    if (!pickedCandidate) {
      break;
    }

    const pickedIndex = remaining.findIndex((candidate) =>
      candidate.movie.id === pickedCandidate?.movie.id,
    );
    if (pickedIndex === -1) {
      break;
    }

    selected.push(remaining[pickedIndex]);
    remaining.splice(pickedIndex, 1);
  }

  return selected.map((candidate) => candidate.movie);
};

export const buildInitialPool = async (input: {
  gameCode: string;
  settings: GameSettings;
}): Promise<MovieCandidate[]> => {
  const seed = await getPoolSeedOrThrow(input.gameCode);
  const plan = planPoolQueries(input.settings, seed);
  const fetchedCandidates = await fetchPoolCandidates(plan, input.settings);

  if (fetchedCandidates.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  const recentHistoryTimestamps = await getRecentHistoryTimestamps(
    fetchedCandidates.map((candidate) => candidate.movie.id),
  );
  const candidates = scorePoolCandidates(
    fetchedCandidates,
    input.settings,
    recentHistoryTimestamps,
  );
  const selectionSalt = randomUUID();
  const movies = selectFinalPool(candidates, input.settings, selectionSalt);
  if (movies.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  await savePoolArtifacts(input.gameCode, {
    plan: {
      ...plan,
      selectionSalt,
    },
    candidates,
    movies,
  });

  return movies;
};

export const saveInitialPool = async (gameCode: string, movies: MovieCandidate[]) => {
  if (movies.length === 0) {
    return;
  }

  await ensureRedis();
  await redis.del(poolKey(gameCode));
  await redis.zAdd(
    poolKey(gameCode),
    movies.map((movie, order) => ({
      value: movie.id,
      score: order,
    })),
  );

  await updateRecentPoolHistory(movies);

  for (const movie of movies) {
    const record: GameRedisService.MovieRecord = {
      movie,
      status: "pending",
      likeCount: 0,
      dislikeCount: 0,
      maybeCount: 0,
      superLikeCount: 0,
      skipCount: 0,
      totalVotes: 0,
    };
    await GameRedisService.setMovieRecord(gameCode, movie.id, record);
  }
};

export const getPoolEntries = async (
  gameCode: string,
): Promise<SwipeQueueService.PlayerQueueEntry[]> => {
  await ensureRedis();
  const movieIds = await redis.zRange(poolKey(gameCode), 0, -1);
  return movieIds.map((movieId, order) => ({
    movieId,
    order,
  }));
};

export const getPoolSize = async (gameCode: string) => {
  await ensureRedis();
  return redis.zCard(poolKey(gameCode));
};

export const maybeRefillPool = async (_input: {gameCode: string}) => {
  return null;
};

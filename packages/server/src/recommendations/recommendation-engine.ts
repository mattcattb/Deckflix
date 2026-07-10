import type {
  GameSettings,
  MovieCandidate,
  MoviePopularityPreset,
} from "@deckflix/shared";
import {createHash} from "node:crypto";
import type {MovieQueryOptions, TimeWindow} from "tmdb-ts";
import {
  type MovieSourceCandidate,
  toMovieSourceCandidateFromTmdb,
} from "../movies/movie-normalizer";
import {
  discoverTmdbMovies,
  getTmdbMovieRecommendations,
  getTmdbPopularMovies,
  getTmdbSimilarMovies,
  getTmdbTrendingMovies,
  toTmdbLanguage,
} from "../movies/tmdb.service";
import * as PreferencesService from "../rooms/room-preferences.service";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HIGH_POPULARITY_THRESHOLD = 65;
const MIN_SELECTION_WEIGHT = 0.001;

type RecommendationSource =
  | "discover"
  | "trending"
  | "recommendation"
  | "similar"
  | "popular";

type RecommendationSourceFamily = RecommendationSource;

type RecommendationStrategy = {
  id: string;
  label: string;
  source: RecommendationSource;
  sourceFamily: RecommendationSourceFamily;
  weight: number;
  pageSampleSize?: number;
  pageBandStart?: number;
  pageBandEnd?: number;
  anchorLimit?: number;
  timeWindow?: TimeWindow;
  filters?: MovieQueryOptions;
};

type RecommendationPlan = {
  version: 2;
  seed: string;
  generatedAt: string;
  settingsFingerprint: string;
  strategies: RecommendationStrategy[];
};

type RecommendationSourceHit = {
  sourceFamily: RecommendationSourceFamily;
  strategyId: string;
  page: number;
  weight: number;
  anchorMovieId?: string;
};

export type RecommendationCandidateRecord = {
  movie: MovieCandidate;
  primarySourceFamily: RecommendationSourceFamily;
  sourceHits: RecommendationSourceHit[];
  discoveredPages: number[];
  features: {
    year: number;
    releaseDate: string | null;
    rating: number;
    voteCount: number;
    popularity: number;
    genreIds: number[];
    dominantGenreId: number | null;
    originalLanguage: string | null;
  };
  scores: {
    filterFit: number;
    quality: number;
    freshness: number;
    novelty: number;
    diversityPotential: number;
    source: number;
    recentHistoryPenalty: number;
    final: number;
  };
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashValue = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

const numberFromSeed = (seed: string) =>
  Number.parseInt(hashValue(seed).slice(0, 8), 16);

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
  filters: MovieQueryOptions,
  startYear: number,
  endYear: number,
): MovieQueryOptions => {
  if (
    filters["primary_release_date.gte"] ||
    filters["primary_release_date.lte"]
  ) {
    return filters;
  }

  return {
    ...filters,
    "primary_release_date.gte": `${startYear}-01-01`,
    "primary_release_date.lte": `${endYear}-12-31`,
  };
};

const getPopularityPreset = (
  preferences: PreferencesService.GamePreferences,
): MoviePopularityPreset => preferences.popularityPreset;

const getPresetWeights = (preset: MoviePopularityPreset) => {
  switch (preset) {
    case "any":
      return {
        broad: 0.22,
        mid: 0.2,
        deep: 0.18,
        trending: 0.1,
        recommendation: 0.16,
        similar: 0.14,
      };
    case "popular":
      return {
        broad: 0.34,
        mid: 0.18,
        deep: 0.08,
        trending: 0.18,
        recommendation: 0.13,
        similar: 0.09,
      };
    case "niche":
      return {
        broad: 0.12,
        mid: 0.22,
        deep: 0.28,
        trending: 0.05,
        recommendation: 0.18,
        similar: 0.15,
      };
    case "balanced":
    default:
      return {
        broad: 0.25,
        mid: 0.2,
        deep: 0.2,
        trending: 0.1,
        recommendation: 0.15,
        similar: 0.1,
      };
  }
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

const getPrimarySourceFamily = (
  sourceHits: RecommendationSourceHit[],
): RecommendationSourceFamily => {
  const totals = new Map<RecommendationSourceFamily, number>();
  for (const hit of sourceHits) {
    totals.set(
      hit.sourceFamily,
      (totals.get(hit.sourceFamily) ?? 0) + hit.weight,
    );
  }

  return (
    [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "discover"
  );
};

const createSourceHit = (
  strategy: RecommendationStrategy,
  page: number,
  anchorMovieId?: string,
): RecommendationSourceHit => ({
  sourceFamily: strategy.sourceFamily,
  strategyId: strategy.id,
  page,
  weight: strategy.weight,
  ...(anchorMovieId ? {anchorMovieId} : {}),
});

const toCandidateRecord = (
  movie: MovieSourceCandidate,
  sourceHit: RecommendationSourceHit,
): RecommendationCandidateRecord => ({
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

const mergeSourceHits = (
  existingHits: RecommendationSourceHit[],
  nextHit: RecommendationSourceHit,
) => {
  const duplicate = existingHits.some(
    (hit) =>
      hit.sourceFamily === nextHit.sourceFamily &&
      hit.strategyId === nextHit.strategyId &&
      hit.page === nextHit.page &&
      hit.anchorMovieId === nextHit.anchorMovieId,
  );

  return duplicate ? existingHits : [...existingHits, nextHit];
};

const mergeCandidateRecord = (
  current: RecommendationCandidateRecord,
  movie: MovieSourceCandidate,
  sourceHit: RecommendationSourceHit,
): RecommendationCandidateRecord => {
  const sourceHits = mergeSourceHits(current.sourceHits, sourceHit);
  return {
    ...current,
    movie:
      current.movie.rating >= movie.rating
        ? current.movie
        : {
            id: movie.id,
            title: movie.title,
            year: movie.year,
            overview: movie.overview,
            posterUrl: movie.posterUrl,
            rating: movie.rating,
          },
    primarySourceFamily: getPrimarySourceFamily(sourceHits),
    sourceHits,
    discoveredPages: [
      ...new Set([...current.discoveredPages, sourceHit.page]),
    ].sort((left, right) => left - right),
    features: {
      year: current.features.year || movie.year,
      releaseDate: current.features.releaseDate ?? movie.releaseDate,
      rating: Math.max(current.features.rating, movie.rating),
      voteCount: Math.max(current.features.voteCount, movie.voteCount),
      popularity: Math.max(current.features.popularity, movie.popularity),
      genreIds:
        current.features.genreIds.length > 0
          ? current.features.genreIds
          : movie.genreIds,
      dominantGenreId:
        current.features.dominantGenreId ?? dominantGenreId(movie.genreIds),
      originalLanguage:
        current.features.originalLanguage ?? movie.originalLanguage,
    },
  };
};

const mergeCandidates = (
  candidates: Map<string, RecommendationCandidateRecord>,
  items: MovieSourceCandidate[],
  strategy: RecommendationStrategy,
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

const getSettingsFingerprint = (
  settings: GameSettings,
  preferences: PreferencesService.GamePreferences,
) => hashValue({settings, preferences}).slice(0, 16);

const fetchDiscoverStrategy = async (
  strategy: RecommendationStrategy,
  seed: string,
  strategyFilters?: MovieQueryOptions,
) => {
  const probePage = strategy.pageBandStart ?? 1;
  const filters = strategyFilters ?? strategy.filters ?? {};
  const probe = await discoverTmdbMovies({
    ...filters,
    page: probePage,
    language: toTmdbLanguage(filters.language),
    include_adult: false,
  });
  const bandStart = strategy.pageBandStart ?? probePage;
  const bandEnd = strategy.pageBandEnd ?? probe.total_pages;
  const pages = samplePagesInBand(
    probe.total_pages,
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
          items: probe.results.map(toMovieSourceCandidateFromTmdb),
        };
      }

      const result = await discoverTmdbMovies({
        ...filters,
        page,
        language: toTmdbLanguage(filters.language),
        include_adult: false,
      });
      return {
        page,
        items: result.results.map(toMovieSourceCandidateFromTmdb),
      };
    }),
  );

  return pageResults;
};

const fetchTrendingStrategy = async (strategy: RecommendationStrategy) => {
  const result = await getTmdbTrendingMovies({
    timeWindow: strategy.timeWindow ?? "week",
    page: 1,
  });
  return [
    {
      page: 1,
      items: result.results.map(toMovieSourceCandidateFromTmdb),
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
      items: result.results.map(toMovieSourceCandidateFromTmdb),
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
      items: result.results.map(toMovieSourceCandidateFromTmdb),
    },
  ];
};

const fetchPopularFallback = async (page: number) => {
  const result = await getTmdbPopularMovies({page});
  return {
    page,
    items: result.results.map(toMovieSourceCandidateFromTmdb),
    totalPages: result.total_pages,
  };
};

const scoreFilterFit = (
  candidate: RecommendationCandidateRecord,
  filters: MovieQueryOptions,
) => {
  let checks = 0;
  let score = 0;

  const includedGenreIds = filters.with_genres
    ?.split("|")
    .map((genreId) => Number(genreId))
    .filter((genreId) => !Number.isNaN(genreId));
  const excludedGenreIds = filters.without_genres
    ?.split(",")
    .map((genreId) => Number(genreId))
    .filter((genreId) => !Number.isNaN(genreId));

  if (includedGenreIds?.length) {
    checks += 1;
    const overlap = candidate.features.genreIds.filter((genreId) =>
      includedGenreIds.includes(genreId),
    );
    score += overlap.length / includedGenreIds.length;
  }

  if (excludedGenreIds?.length) {
    checks += 1;
    const overlap = candidate.features.genreIds.some((genreId) =>
      excludedGenreIds.includes(genreId),
    );
    score += overlap ? 0 : 1;
  }

  if (
    filters["primary_release_date.gte"] ||
    filters["primary_release_date.lte"]
  ) {
    checks += 1;
    const releaseDate =
      candidate.features.releaseDate ?? `${candidate.features.year}-01-01`;
    const withinLower =
      !filters["primary_release_date.gte"] ||
      releaseDate >= filters["primary_release_date.gte"];
    const withinUpper =
      !filters["primary_release_date.lte"] ||
      releaseDate <= filters["primary_release_date.lte"];
    score += withinLower && withinUpper ? 1 : 0;
  }

  if (
    filters["vote_average.gte"] != null ||
    filters["vote_average.lte"] != null
  ) {
    checks += 1;
    const withinLower =
      filters["vote_average.gte"] == null ||
      candidate.features.rating >= filters["vote_average.gte"];
    const withinUpper =
      filters["vote_average.lte"] == null ||
      candidate.features.rating <= filters["vote_average.lte"];
    score += withinLower && withinUpper ? 1 : 0;
  }

  return checks === 0 ? 1 : score / checks;
};

const scoreQuality = (candidate: RecommendationCandidateRecord) => {
  const ratingScore = clamp(candidate.features.rating / 10);
  const voteScore = clamp(Math.log10(candidate.features.voteCount + 1) / 4);
  return ratingScore * 0.72 + voteScore * 0.28;
};

const scoreFreshness = (
  candidate: RecommendationCandidateRecord,
  popularityPreset: MoviePopularityPreset,
) => {
  const familySet = new Set(
    candidate.sourceHits.map((hit) => hit.sourceFamily),
  );
  const releaseYear = candidate.features.year;
  const currentYear = new Date().getUTCFullYear();
  const yearDelta =
    releaseYear > 0 ? Math.max(0, currentYear - releaseYear) : 30;
  const releaseScore =
    yearDelta <= 1 ? 1 : yearDelta <= 3 ? 0.8 : yearDelta <= 7 ? 0.55 : 0.3;
  const sourceBonus =
    (familySet.has("trending") ? 0.35 : 0) +
    (familySet.has("recommendation") ? 0.22 : 0) +
    (familySet.has("similar") ? 0.15 : 0);
  const popularitySupport = clamp(
    Math.log10(candidate.features.popularity + 1) / 3.5,
  );
  const presetBoost =
    popularityPreset === "popular"
      ? popularitySupport * 0.08
      : popularityPreset === "niche"
        ? (1 - popularitySupport) * 0.08
        : 0;
  return clamp(
    releaseScore * 0.65 + sourceBonus + popularitySupport * 0.15 + presetBoost,
  );
};

const scoreNovelty = (
  candidate: RecommendationCandidateRecord,
  popularityPreset: MoviePopularityPreset,
) => {
  const familyCount = new Set(
    candidate.sourceHits.map((hit) => hit.sourceFamily),
  ).size;
  const averagePage =
    candidate.sourceHits.reduce((total, hit) => total + hit.page, 0) /
    candidate.sourceHits.length;
  const familyBase =
    familyCount <= 1
      ? 0.55
      : familyCount === 2
        ? 0.85
        : familyCount === 3
          ? 0.5
          : 0.25;
  const pageDepthScore = clamp((averagePage - 1) / 40);
  const popularityPenalty = clamp(candidate.features.popularity / 140);
  const presetOffset =
    popularityPreset === "popular"
      ? popularityPenalty * 0.08
      : popularityPreset === "niche"
        ? (1 - popularityPenalty) * 0.12
        : 0;
  return clamp(
    familyBase + pageDepthScore * 0.2 - popularityPenalty * 0.15 + presetOffset,
  );
};

const scoreDiversityPotential = (
  candidate: RecommendationCandidateRecord,
  popularityPreset: MoviePopularityPreset,
) => {
  const genreBreadth = clamp(candidate.features.genreIds.length / 4);
  const pageDepth =
    candidate.sourceHits.reduce((total, hit) => total + hit.page, 0) /
    candidate.sourceHits.length;
  const pageDepthScore = clamp((pageDepth - 1) / 50);
  const lowPopularityBonus = 1 - clamp(candidate.features.popularity / 110);
  if (popularityPreset === "popular") {
    const popularityReach = clamp(
      Math.log10(candidate.features.popularity + 1) / 3.5,
    );
    return genreBreadth * 0.35 + pageDepthScore * 0.2 + popularityReach * 0.45;
  }

  const lowPopularityWeight = popularityPreset === "niche" ? 0.5 : 0.35;
  const genreWeight = popularityPreset === "niche" ? 0.3 : 0.35;
  const pageWeight = popularityPreset === "niche" ? 0.2 : 0.3;
  return (
    genreBreadth * genreWeight +
    pageDepthScore * pageWeight +
    lowPopularityBonus * lowPopularityWeight
  );
};

const scoreSource = (candidate: RecommendationCandidateRecord) => {
  const totalWeight = candidate.sourceHits.reduce(
    (total, hit) => total + hit.weight,
    0,
  );
  const familyCount = new Set(
    candidate.sourceHits.map((hit) => hit.sourceFamily),
  ).size;
  const anchorBoost = candidate.sourceHits.some((hit) => hit.anchorMovieId)
    ? 0.1
    : 0;
  return (
    clamp(totalWeight / 0.5) * 0.8 +
    clamp((familyCount - 1) / 3) * 0.1 +
    anchorBoost
  );
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

const listBaseStrategies = (plan: RecommendationPlan) =>
  plan.strategies.filter(
    (strategy) =>
      strategy.source === "discover" || strategy.source === "trending",
  );

const listExpansionStrategies = (plan: RecommendationPlan) =>
  plan.strategies.filter(
    (strategy) =>
      strategy.source === "recommendation" || strategy.source === "similar",
  );

const selectExpansionAnchors = (
  candidates: RecommendationCandidateRecord[],
  anchorLimit: number,
) => {
  const anchors: RecommendationCandidateRecord[] = [];
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

const scoreBaseCandidatesForAnchors = (
  candidates: RecommendationCandidateRecord[],
  preferences: PreferencesService.GamePreferences,
) => {
  const filters = PreferencesService.buildMovieDiscoveryOptions(preferences);
  const popularityPreset = getPopularityPreset(preferences);

  return [...candidates]
    .map((candidate) => {
      const filterFit = scoreFilterFit(candidate, filters);
      const quality = scoreQuality(candidate);
      const freshness = scoreFreshness(candidate, popularityPreset);
      const novelty = scoreNovelty(candidate, popularityPreset);
      const anchorScore =
        filterFit * 0.42 + quality * 0.34 + freshness * 0.14 + novelty * 0.1;
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

const getSelectionCaps = (
  maxMovies: number,
  popularityPreset: MoviePopularityPreset,
) => ({
  maxConsecutivePerDecade: 2,
  maxConsecutivePerGenre: 2,
  maxPerSourceFamily:
    popularityPreset === "any"
      ? Math.max(1, Math.floor(maxMovies * 0.45))
      : popularityPreset === "popular"
        ? Math.max(1, Math.floor(maxMovies * 0.4))
        : Math.max(1, Math.floor(maxMovies * 0.35)),
  maxHighPopularity:
    popularityPreset === "any"
      ? maxMovies
      : popularityPreset === "popular"
        ? Math.max(1, Math.floor(maxMovies * 0.6))
        : popularityPreset === "niche"
          ? Math.max(1, Math.floor(maxMovies * 0.25))
          : Math.max(1, Math.floor(maxMovies * 0.4)),
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

const isHighPopularity = (candidate: RecommendationCandidateRecord) =>
  candidate.features.popularity >= HIGH_POPULARITY_THRESHOLD;

const passesSelectionConstraints = (
  candidate: RecommendationCandidateRecord,
  selected: RecommendationCandidateRecord[],
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
    recent.every(
      (item) =>
        item.features.dominantGenreId === candidate.features.dominantGenreId,
    )
  ) {
    return false;
  }

  if (relaxation.enforceSourceFamily) {
    const sourceFamilyCount = selected.filter(
      (item) => item.primarySourceFamily === candidate.primarySourceFamily,
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
  candidates: RecommendationCandidateRecord[],
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

export const planRecommendationQueries = (
  settings: GameSettings,
  preferencesOrSeed: PreferencesService.GamePreferences | string,
  maybeSeed?: string,
): RecommendationPlan => {
  const preferences =
    typeof preferencesOrSeed === "string"
      ? PreferencesService.DEFAULT_GAME_PREFERENCES
      : preferencesOrSeed;
  const seed =
    typeof preferencesOrSeed === "string" ? preferencesOrSeed : maybeSeed!;
  const baseFilters = PreferencesService.buildMovieDiscoveryOptions(preferences);
  const popularityPreset = getPopularityPreset(preferences);
  const weights = getPresetWeights(popularityPreset);
  const currentYear = new Date().getUTCFullYear();
  const deepCutStart = pickInt(
    `${seed}:deep:start`,
    1982,
    Math.max(1982, currentYear - 18),
  );
  const deepCutEnd = Math.min(deepCutStart + 8, currentYear - 3);

  return {
    version: 2,
    seed,
    generatedAt: new Date().toISOString(),
    settingsFingerprint: getSettingsFingerprint(settings, preferences),
    strategies: [
      {
        id: "discover-broad",
        label: "Discover Broad",
        source: "discover",
        sourceFamily: "discover",
        weight: weights.broad,
        pageSampleSize: popularityPreset === "niche" ? 2 : 3,
        pageBandStart: popularityPreset === "niche" ? 2 : 1,
        pageBandEnd:
          popularityPreset === "popular"
            ? 2
            : popularityPreset === "any"
              ? 6
              : popularityPreset === "niche"
                ? 8
                : 3,
        filters: {
          ...baseFilters,
          sort_by: "popularity.desc",
          "vote_count.gte":
            popularityPreset === "popular"
              ? 250
              : popularityPreset === "niche"
                ? 20
                : popularityPreset === "any"
                  ? 25
                  : 50,
          "vote_count.lte": popularityPreset === "niche" ? 2000 : undefined,
        },
      },
      {
        id: "discover-mid-depth",
        label: "Discover Mid Depth",
        source: "discover",
        sourceFamily: "discover",
        weight: weights.mid,
        pageSampleSize: 3,
        pageBandStart:
          popularityPreset === "popular"
            ? 2
            : popularityPreset === "niche"
              ? 8
              : 4,
        pageBandEnd:
          popularityPreset === "popular"
            ? 10
            : popularityPreset === "niche"
              ? 28
              : popularityPreset === "any"
                ? 20
                : 15,
        filters: {
          ...baseFilters,
          sort_by:
            popularityPreset === "popular"
              ? "popularity.desc"
              : "vote_average.desc",
          "vote_count.gte":
            popularityPreset === "popular"
              ? 150
              : popularityPreset === "niche"
                ? 50
                : 120,
          "vote_average.gte": Math.max(
            baseFilters["vote_average.gte"] ?? 0,
            6.2,
          ),
        },
      },
      {
        id: "discover-deep-cut",
        label: "Discover Deep Cut",
        source: "discover",
        sourceFamily: "discover",
        weight: weights.deep,
        pageSampleSize: popularityPreset === "popular" ? 2 : 4,
        pageBandStart:
          popularityPreset === "popular"
            ? 8
            : popularityPreset === "any"
              ? 12
              : popularityPreset === "niche"
                ? 20
                : 16,
        pageBandEnd:
          popularityPreset === "popular"
            ? 30
            : popularityPreset === "any"
              ? 100
              : popularityPreset === "niche"
                ? 120
                : 80,
        filters: maybeApplyDateWindow(
          {
            ...baseFilters,
            sort_by: "vote_count.desc",
            "vote_count.gte":
              popularityPreset === "popular"
                ? 40
                : popularityPreset === "niche"
                  ? 5
                  : 15,
            "vote_count.lte":
              popularityPreset === "popular"
                ? 5000
                : popularityPreset === "niche"
                  ? 700
                  : 1500,
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
        weight: weights.trending,
        timeWindow: "week",
      },
      {
        id: "recommendation-expansion",
        label: "Recommendation Expansion",
        source: "recommendation",
        sourceFamily: "recommendation",
        weight: weights.recommendation,
        anchorLimit: 3,
      },
      {
        id: "similar-expansion",
        label: "Similar Expansion",
        source: "similar",
        sourceFamily: "similar",
        weight: weights.similar,
        anchorLimit: 3,
      },
    ],
  };
};

export const fetchRecommendationCandidates = async (input: {
  plan: RecommendationPlan;
  settings: GameSettings;
  preferences: PreferencesService.GamePreferences;
  anchorMovieIds?: string[];
}) => {
  const {plan, settings, preferences} = input;
  const candidates = new Map<string, RecommendationCandidateRecord>();
  const hardDiscoveryFilters =
    preferences.preferredProviderIds.length > 0 ||
    preferences.runtimeMinutesLte != null;
  const baseStrategies = listBaseStrategies(plan).filter(
    (strategy) => !hardDiscoveryFilters || strategy.source === "discover",
  );
  const baseResults = await Promise.allSettled(
    baseStrategies.map(async (strategy) => ({
      strategy,
      pageResults:
        strategy.source === "discover"
          ? await fetchDiscoverStrategy(strategy, plan.seed, strategy.filters)
          : await fetchTrendingStrategy(strategy),
    })),
  );
  let discoverSuccessCount = 0;
  const baseDiscoverSuccessCount = baseResults.reduce((count, result) => {
    if (result.status !== "fulfilled") {
      return count;
    }

    for (const pageResult of result.value.pageResults) {
      mergeCandidates(
        candidates,
        pageResult.items,
        result.value.strategy,
        pageResult.page,
      );
    }
    return result.value.strategy.source === "discover" ? count + 1 : count;
  }, 0);
  discoverSuccessCount = baseDiscoverSuccessCount;
  const tasteAnchorResults = await Promise.allSettled(
    (hardDiscoveryFilters ? [] : input.anchorMovieIds ?? [])
      .slice(0, 6)
      .flatMap((anchorMovieId) => [
      fetchRecommendationStrategy(anchorMovieId).then((pageResults) => ({
        anchorMovieId,
        pageResults,
        strategy: {
          id: "taste-recommendation",
          label: "Player Taste",
          source: "recommendation",
          sourceFamily: "recommendation",
          weight: 0.28,
        } satisfies RecommendationStrategy,
      })),
      fetchSimilarStrategy(anchorMovieId).then((pageResults) => ({
        anchorMovieId,
        pageResults,
        strategy: {
          id: "taste-similar",
          label: "Player Taste",
          source: "similar",
          sourceFamily: "similar",
          weight: 0.22,
        } satisfies RecommendationStrategy,
      })),
      ]),
  );
  for (const result of tasteAnchorResults) {
    if (result.status !== "fulfilled") continue;
    for (const pageResult of result.value.pageResults) {
      mergeCandidates(
        candidates,
        pageResult.items,
        result.value.strategy,
        pageResult.page,
        result.value.anchorMovieId,
      );
    }
  }

  const provisionalAnchors = selectExpansionAnchors(
    scoreBaseCandidatesForAnchors([...candidates.values()], preferences),
    3,
  );

  const expansionResults = await Promise.allSettled(
    (hardDiscoveryFilters ? [] : listExpansionStrategies(plan)).flatMap((strategy) =>
      provisionalAnchors
        .slice(0, strategy.anchorLimit ?? 3)
        .map(async (anchor) => ({
          strategy,
          anchorMovieId: anchor.movie.id,
          pageResults:
            strategy.source === "recommendation"
              ? await fetchRecommendationStrategy(anchor.movie.id)
              : await fetchSimilarStrategy(anchor.movie.id),
        })),
    ),
  );
  for (const result of expansionResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    for (const pageResult of result.value.pageResults) {
      mergeCandidates(
        candidates,
        pageResult.items,
        result.value.strategy,
        pageResult.page,
        result.value.anchorMovieId,
      );
    }
  }

  if (
    candidates.size === 0 ||
    (discoverSuccessCount === 0 &&
      candidates.size < settings.gameplay.maxMovies)
  ) {
    try {
      if (hardDiscoveryFilters) throw new Error("Hard filters returned no movies");
      const fallback = await fetchPopularFallback(1);
      const popularStrategy: RecommendationStrategy = {
        id: "popular-fallback",
        label: "Popular Fallback",
        source: "popular",
        sourceFamily: "popular",
        weight: 0.08,
      };
      mergeCandidates(
        candidates,
        fallback.items,
        popularStrategy,
        fallback.page,
      );
    } catch {
      // Keep the existing failure path below.
    }
  }

  return [...candidates.values()];
};

export const scoreRecommendationCandidates = (
  candidates: RecommendationCandidateRecord[],
  preferences: PreferencesService.GamePreferences,
  recentHistoryTimestamps = new Map<string, number | null>(),
) => {
  const filters = PreferencesService.buildMovieDiscoveryOptions(preferences);
  const popularityPreset = getPopularityPreset(preferences);

  return candidates
    .map((candidate) => {
      const filterFit = scoreFilterFit(candidate, filters);
      const quality = scoreQuality(candidate);
      const freshness = scoreFreshness(candidate, popularityPreset);
      const novelty = scoreNovelty(candidate, popularityPreset);
      const diversityPotential = scoreDiversityPotential(
        candidate,
        popularityPreset,
      );
      const source = scoreSource(candidate);
      const recentHistoryPenalty = scoreRecentHistoryPenalty(
        recentHistoryTimestamps.get(candidate.movie.id),
      );
      const final =
        filterFit * 0.28 +
        quality * 0.2 +
        freshness * 0.12 +
        novelty * 0.16 +
        diversityPotential * 0.1 +
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

export const selectRecommendedMovies = (
  candidates: RecommendationCandidateRecord[],
  settings: GameSettings,
  preferencesOrSelectionSalt: PreferencesService.GamePreferences | string,
  maybeSelectionSalt?: string,
) => {
  const preferences =
    typeof preferencesOrSelectionSalt === "string"
      ? PreferencesService.DEFAULT_GAME_PREFERENCES
      : preferencesOrSelectionSalt;
  const selectionSalt =
    typeof preferencesOrSelectionSalt === "string"
      ? preferencesOrSelectionSalt
      : maybeSelectionSalt!;
  const maxMovies = settings.gameplay.maxMovies;
  const windowSize = toSelectionWindowSize(maxMovies);
  const caps = getSelectionCaps(maxMovies, getPopularityPreset(preferences));
  const remaining = [...candidates.slice(0, windowSize)];
  const selected: RecommendationCandidateRecord[] = [];
  const random = createSeededRandom(selectionSalt);

  while (selected.length < maxMovies && remaining.length > 0) {
    let pickedCandidate: RecommendationCandidateRecord | null = null;

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

    const pickedIndex = remaining.findIndex(
      (candidate) => candidate.movie.id === pickedCandidate?.movie.id,
    );
    if (pickedIndex === -1) {
      break;
    }

    selected.push(remaining[pickedIndex]);
    remaining.splice(pickedIndex, 1);
  }

  return selected.map((candidate) => candidate.movie);
};

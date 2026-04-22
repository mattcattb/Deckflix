import type {MovieCandidate} from "@deckflix/shared";
import type {GameSettings} from "@deckflix/shared";
import {createHash, randomUUID} from "node:crypto";
import {BadRequestException, NotFoundException} from "../common/errors";
import {discoverTmdbMovies, isTmdbConfigured} from "../lib/tmdb";
import {ensureRedis, redis} from "../lib/redis";
import * as MoviesService from "../movies/movies.service";
import * as GameSettingsService from "../settings/game-settings.service";
import type * as SwipeQueueService from "../swipe/swipe-queue.service";
import * as GameRedisService from "./game-redis.service";
import type {
  PoolBuildResult,
  PoolCandidateRecord,
  PoolQueryFilters,
  PoolQueryVariant,
  PoolSeedContext,
  PoolSourceMovie,
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

const samplePages = (totalPages: number, pageSampleSize: number, seed: string) => {
  const boundedTotal = Math.max(1, totalPages);
  const boundedRange = Math.min(boundedTotal, 12);
  const targetSize = Math.max(1, Math.min(pageSampleSize, boundedRange));
  const pages = new Set<number>([1]);
  const random = createSeededRandom(seed);

  while (pages.size < targetSize) {
    const candidate = 1 + Math.floor(Math.pow(random(), 1.8) * boundedRange);
    pages.add(Math.min(candidate, boundedRange));
  }

  return [...pages];
};

const dominantGenreId = (genreIds: number[]) => genreIds[0] ?? null;

const toPoolSourceMovie = (movie: MovieCandidate): PoolSourceMovie => ({
  ...movie,
  voteCount: 0,
  popularity: 0,
  genreIds: [],
  originalLanguage: null,
});

const toCandidateRecord = (
  movie: PoolSourceMovie,
  variant: PoolQueryVariant,
  page: number,
): PoolCandidateRecord => ({
  movie: {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    overview: movie.overview,
    posterUrl: movie.posterUrl,
    rating: movie.rating,
  },
  sourceVariantIds: [variant.id],
  discoveredPages: [page],
  features: {
    year: movie.year,
    rating: movie.rating,
    voteCount: movie.voteCount,
    popularity: movie.popularity,
    genreIds: movie.genreIds,
    dominantGenreId: dominantGenreId(movie.genreIds),
    originalLanguage: movie.originalLanguage,
  },
  scores: {
    relevance: 0,
    quality: 0,
    popularity: 0,
    diversity: 0,
    jitter: 0,
    final: 0,
  },
});

const mergeCandidateRecord = (
  current: PoolCandidateRecord,
  movie: PoolSourceMovie,
  variant: PoolQueryVariant,
  page: number,
): PoolCandidateRecord => ({
  ...current,
  movie: current.movie.rating >= movie.rating ? current.movie : {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    overview: movie.overview,
    posterUrl: movie.posterUrl,
    rating: movie.rating,
  },
  sourceVariantIds: [...new Set([...current.sourceVariantIds, variant.id])],
  discoveredPages: [...new Set([...current.discoveredPages, page])].sort((left, right) =>
    left - right,
  ),
  features: {
    year: current.features.year || movie.year,
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
});

const getSettingsFingerprint = (settings: GameSettings) => hashValue(settings).slice(0, 16);

const fetchPageForVariant = async (
  variant: PoolQueryVariant,
  page: number,
): Promise<{items: PoolSourceMovie[]; totalPages: number}> => {
  if (isTmdbConfigured() && variant.source === "discover") {
    const result = await discoverTmdbMovies({
      ...variant.filters,
      page,
    });
    return {
      items: result.items,
      totalPages: result.totalPages,
    };
  }

  const result = await MoviesService.getPopularMovies({page});
  return {
    items: result.items.map(toPoolSourceMovie),
    totalPages: result.totalPages,
  };
};

const getSelectionCaps = (maxMovies: number) => ({
  maxConsecutivePerDecade: 2,
  maxConsecutivePerGenre: 2,
  maxHighPopularity: Math.max(2, Math.ceil(maxMovies * 0.6)),
});

const shouldSkipForDiversity = (
  candidate: PoolCandidateRecord,
  selected: PoolCandidateRecord[],
  caps: ReturnType<typeof getSelectionCaps>,
) => {
  const decade = Math.floor(candidate.features.year / 10);
  const dominantGenre = candidate.features.dominantGenreId;
  const recent = selected.slice(-caps.maxConsecutivePerDecade);

  if (
    recent.length >= caps.maxConsecutivePerDecade &&
    recent.every((item) => Math.floor(item.features.year / 10) === decade)
  ) {
    return true;
  }

  if (
    dominantGenre &&
    recent.length >= caps.maxConsecutivePerGenre &&
    recent.every((item) => item.features.dominantGenreId === dominantGenre)
  ) {
    return true;
  }

  const highPopularityCount = selected.filter((item) => item.features.popularity >= 60).length;
  if (candidate.features.popularity >= 60 && highPopularityCount >= caps.maxHighPopularity) {
    return true;
  }

  return false;
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
    const releaseDate = `${candidate.features.year}-01-01`;
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
  const voteScore = clamp(Math.log10(candidate.features.voteCount + 1) / 3);
  return ratingScore * 0.65 + voteScore * 0.35;
};

const scorePopularity = (candidate: PoolCandidateRecord) => {
  const popularityScore = clamp(candidate.features.popularity / 100);
  const reliabilityScore = clamp(Math.log10(candidate.features.voteCount + 1) / 4);
  return popularityScore * 0.55 + reliabilityScore * 0.45;
};

const scoreDiversity = (candidate: PoolCandidateRecord, variantCount: number) => {
  const variantCoverage = clamp(candidate.sourceVariantIds.length / Math.max(variantCount, 1));
  const genreBreadth = clamp(candidate.features.genreIds.length / 3);
  return variantCoverage * 0.7 + genreBreadth * 0.3;
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

export const planPoolQueries = (settings: GameSettings, seed: string) => {
  const baseFilters = GameSettingsService.buildMovieDiscoveryFilters(settings);
  const baseVoteCountFloor = 0;
  const currentYear = new Date().getUTCFullYear();
  const recentStart = currentYear - pickInt(`${seed}:recent:start`, 1, 4);
  const recentEnd = Math.min(currentYear, recentStart + 3);
  const catalogStart = pickInt(`${seed}:catalog:start`, 1982, currentYear - 15);
  const catalogEnd = Math.min(catalogStart + 6, currentYear - 8);
  const surpriseStart = pickInt(`${seed}:surprise:start`, 1995, currentYear - 3);
  const surpriseEnd = Math.min(surpriseStart + 4, currentYear);

  const variants: PoolQueryVariant[] = [
    {
      id: "broad-popular",
      label: "Broad Popular",
      source: "discover",
      weight: 1,
      pageSampleSize: 3,
      filters: {
        ...baseFilters,
        sortBy: "popularity.desc",
        voteCountGte: 50,
      },
    },
    {
      id: "audience-favorites",
      label: "Audience Favorites",
      source: "discover",
      weight: 1,
      pageSampleSize: 2,
      filters: {
        ...baseFilters,
        sortBy: "vote_average.desc",
        voteCountGte: Math.max(baseVoteCountFloor, 200),
        voteAverageGte: Math.max(baseFilters.voteAverageGte ?? 0, 6.4),
      },
    },
    {
      id: "recent-releases",
      label: "Recent Releases",
      source: "discover",
      weight: 0.9,
      pageSampleSize: 2,
      filters: maybeApplyDateWindow(
        {
          ...baseFilters,
          sortBy: "primary_release_date.desc",
          voteCountGte: Math.max(baseVoteCountFloor, 35),
        },
        recentStart,
        recentEnd,
      ),
    },
    {
      id: "catalog-dive",
      label: "Catalog Dive",
      source: "discover",
      weight: 0.85,
      pageSampleSize: 2,
      filters: maybeApplyDateWindow(
        {
          ...baseFilters,
          sortBy: "vote_count.desc",
          voteCountGte: Math.max(Math.min(30, 30), 15),
        },
        catalogStart,
        catalogEnd,
      ),
    },
    {
      id: "surprise-slice",
      label: "Surprise Slice",
      source: "discover",
      weight: 0.75,
      pageSampleSize: 2,
      filters: maybeApplyDateWindow(
        {
          ...baseFilters,
          sortBy: createSeededRandom(`${seed}:surprise:sort`)() > 0.5
            ? "popularity.desc"
            : "release_date.desc",
          voteCountGte: 10,
          voteCountLte: 6000,
        },
        surpriseStart,
        surpriseEnd,
      ),
    },
  ];

  return {
    version: 1 as const,
    seed,
    generatedAt: new Date().toISOString(),
    settingsFingerprint: getSettingsFingerprint(settings),
    variants,
  };
};

export const fetchPoolCandidates = async (plan: ReturnType<typeof planPoolQueries>) => {
  const candidates = new Map<string, PoolCandidateRecord>();

  for (const variant of plan.variants) {
    let firstPage;
    try {
      firstPage = await fetchPageForVariant(variant, 1);
    } catch {
      firstPage = await fetchPageForVariant(
        {
          ...variant,
          source: "popular",
        },
        1,
      );
    }

    const pages = samplePages(
      firstPage.totalPages,
      variant.pageSampleSize,
      `${plan.seed}:${variant.id}`,
    );

    const pageResults = await Promise.all(
      pages.map(async (page) => {
        if (page === 1) {
          return {page, items: firstPage.items};
        }

        try {
          const nextPage = await fetchPageForVariant(variant, page);
          return {page, items: nextPage.items};
        } catch {
          return {page, items: [] as PoolSourceMovie[]};
        }
      }),
    );

    for (const pageResult of pageResults) {
      for (const movie of pageResult.items) {
        const current = candidates.get(movie.id);
        if (current) {
          candidates.set(
            movie.id,
            mergeCandidateRecord(current, movie, variant, pageResult.page),
          );
          continue;
        }

        candidates.set(movie.id, toCandidateRecord(movie, variant, pageResult.page));
      }
    }
  }

  return [...candidates.values()];
};

export const scorePoolCandidates = (
  candidates: PoolCandidateRecord[],
  settings: GameSettings,
  seed: string,
) => {
  const filters = GameSettingsService.buildMovieDiscoveryFilters(settings);
  const variantCount = new Set(
    candidates.flatMap((candidate) => candidate.sourceVariantIds),
  ).size;

  return candidates
    .map((candidate) => {
      const relevance = scoreFilterFit(candidate, filters);
      const quality = scoreQuality(candidate);
      const popularity = scorePopularity(candidate);
      const diversity = scoreDiversity(candidate, variantCount);
      const jitter = createSeededRandom(`${seed}:${candidate.movie.id}`)() - 0.5;
      const final =
        relevance * 0.4 +
        quality * 0.24 +
        popularity * 0.22 +
        diversity * 0.08 +
        jitter * 0.06;

      return {
        ...candidate,
        scores: {
          relevance,
          quality,
          popularity,
          diversity,
          jitter,
          final,
        },
      };
    })
    .sort((left, right) => right.scores.final - left.scores.final);
};

export const selectFinalPool = (
  candidates: PoolCandidateRecord[],
  settings: GameSettings,
) => {
  const maxMovies = settings.gameplay.maxMovies;
  const caps = getSelectionCaps(maxMovies);
  const selected: PoolCandidateRecord[] = [];
  const deferred: PoolCandidateRecord[] = [];

  for (const candidate of candidates) {
    if (selected.length >= maxMovies) {
      break;
    }

    if (shouldSkipForDiversity(candidate, selected, caps)) {
      deferred.push(candidate);
      continue;
    }

    selected.push(candidate);
  }

  for (const candidate of deferred) {
    if (selected.length >= maxMovies) {
      break;
    }
    selected.push(candidate);
  }

  return selected.map((candidate) => candidate.movie);
};

export const buildInitialPool = async (input: {
  gameCode: string;
  settings: GameSettings;
}): Promise<MovieCandidate[]> => {
  const seed = await getPoolSeedOrThrow(input.gameCode);
  const plan = planPoolQueries(input.settings, seed);
  const fetchedCandidates = await fetchPoolCandidates(plan);

  if (fetchedCandidates.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  const candidates = scorePoolCandidates(fetchedCandidates, input.settings, seed);
  const movies = selectFinalPool(candidates, input.settings);
  if (movies.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  await savePoolArtifacts(input.gameCode, {
    plan,
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

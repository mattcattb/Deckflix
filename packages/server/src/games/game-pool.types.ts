import {movieCandidateSchema} from "@deckflix/shared";
import {z} from "zod";

export const poolSortOptionSchema = z.enum([
  "first_air_date.asc",
  "first_air_date.desc",
  "popularity.asc",
  "popularity.desc",
  "release_date.asc",
  "release_date.desc",
  "revenue.asc",
  "revenue.desc",
  "primary_release_date.asc",
  "primary_release_date.desc",
  "original_title.asc",
  "original_title.desc",
  "vote_average.asc",
  "vote_average.desc",
  "vote_count.asc",
  "vote_count.desc",
]);

export const poolSourceFamilySchema = z.enum([
  "discover",
  "trending",
  "recommendation",
  "similar",
  "popular",
]);

export const poolSourceSchema = z.enum([
  "discover",
  "trending",
  "recommendation",
  "similar",
  "popular",
]);

export const poolTimeWindowSchema = z.enum(["day", "week"]);

export const poolQueryFiltersSchema = z.object({
  sortBy: poolSortOptionSchema.optional(),
  page: z.number().int().min(1).optional(),
  primaryReleaseYear: z.number().int().min(1874).optional(),
  primaryReleaseDateGte: z.string().optional(),
  primaryReleaseDateLte: z.string().optional(),
  voteAverageGte: z.number().min(0).max(10).optional(),
  voteAverageLte: z.number().min(0).max(10).optional(),
  voteCountGte: z.number().int().min(0).optional(),
  voteCountLte: z.number().int().min(0).optional(),
  includedGenreIds: z.array(z.number().int().positive()).optional(),
  excludedGenreIds: z.array(z.number().int().positive()).optional(),
  runtimeGte: z.number().int().positive().optional(),
  runtimeLte: z.number().int().positive().optional(),
  originalLanguage: z.string().min(2).max(12).optional(),
  region: z.string().min(2).max(8).optional(),
  watchRegion: z.string().min(2).max(8).optional(),
  watchProviderIds: z.array(z.number().int().positive()).optional(),
});

export const poolStrategySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: poolSourceSchema,
  sourceFamily: poolSourceFamilySchema,
  weight: z.number().positive(),
  pageSampleSize: z.number().int().min(1).max(6).optional(),
  pageBandStart: z.number().int().min(1).max(500).optional(),
  pageBandEnd: z.number().int().min(1).max(500).optional(),
  anchorLimit: z.number().int().min(1).max(5).optional(),
  timeWindow: poolTimeWindowSchema.optional(),
  filters: poolQueryFiltersSchema.optional(),
});

export const poolPlanSchema = z.object({
  version: z.literal(2),
  seed: z.string().min(1),
  generatedAt: z.string().datetime(),
  settingsFingerprint: z.string().min(1),
  selectionSalt: z.string().min(1).optional(),
  strategies: z.array(poolStrategySchema).min(1),
});

export const poolSourceHitSchema = z.object({
  sourceFamily: poolSourceFamilySchema,
  strategyId: z.string().min(1),
  page: z.number().int().min(1),
  weight: z.number().positive(),
  anchorMovieId: z.string().min(1).optional(),
});

export const poolCandidateScoresSchema = z.object({
  filterFit: z.number(),
  quality: z.number(),
  freshness: z.number(),
  novelty: z.number(),
  diversityPotential: z.number(),
  source: z.number(),
  recentHistoryPenalty: z.number(),
  final: z.number(),
});

export const poolCandidateFeaturesSchema = z.object({
  year: z.number().int(),
  releaseDate: z.string().nullable(),
  rating: z.number(),
  voteCount: z.number().int().min(0),
  popularity: z.number().min(0),
  genreIds: z.array(z.number().int().positive()),
  dominantGenreId: z.number().int().positive().nullable(),
  originalLanguage: z.string().nullable(),
});

export const poolSourceMovieSchema = movieCandidateSchema.extend({
  releaseDate: z.string().nullable().default(null),
  voteCount: z.number().int().min(0).default(0),
  popularity: z.number().min(0).default(0),
  genreIds: z.array(z.number().int().positive()).default([]),
  originalLanguage: z.string().nullable().default(null),
});

export const poolSourceMovieListResultSchema = z.object({
  page: z.number().int().min(1),
  totalPages: z.number().int().min(1),
  totalResults: z.number().int().min(0),
  items: z.array(poolSourceMovieSchema),
});

export const poolCandidateRecordSchema = z.object({
  movie: movieCandidateSchema,
  primarySourceFamily: poolSourceFamilySchema,
  sourceHits: z.array(poolSourceHitSchema).min(1),
  discoveredPages: z.array(z.number().int().min(1)).min(1),
  features: poolCandidateFeaturesSchema,
  scores: poolCandidateScoresSchema,
});

export const poolBuildResultSchema = z.object({
  plan: poolPlanSchema,
  candidates: z.array(poolCandidateRecordSchema),
  movies: z.array(movieCandidateSchema),
});

export type PoolSortOption = z.infer<typeof poolSortOptionSchema>;
export type PoolSourceFamily = z.infer<typeof poolSourceFamilySchema>;
export type PoolSource = z.infer<typeof poolSourceSchema>;
export type PoolTimeWindow = z.infer<typeof poolTimeWindowSchema>;
export type PoolQueryFilters = z.infer<typeof poolQueryFiltersSchema>;
export type PoolStrategy = z.infer<typeof poolStrategySchema>;
export type PoolPlan = z.infer<typeof poolPlanSchema>;
export type PoolSourceHit = z.infer<typeof poolSourceHitSchema>;
export type PoolCandidateScores = z.infer<typeof poolCandidateScoresSchema>;
export type PoolCandidateFeatures = z.infer<typeof poolCandidateFeaturesSchema>;
export type PoolSourceMovie = z.infer<typeof poolSourceMovieSchema>;
export type PoolSourceMovieListResult = z.infer<typeof poolSourceMovieListResultSchema>;
export type PoolCandidateRecord = z.infer<typeof poolCandidateRecordSchema>;
export type PoolBuildResult = z.infer<typeof poolBuildResultSchema>;
export type PoolSeedContext = {
  gameCode: string;
  seed: string;
};

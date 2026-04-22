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

export const poolQueryVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.enum(["discover", "popular"]),
  weight: z.number().positive(),
  pageSampleSize: z.number().int().min(1).max(6),
  filters: poolQueryFiltersSchema,
});

export const poolPlanSchema = z.object({
  version: z.literal(1),
  seed: z.string().min(1),
  generatedAt: z.string().datetime(),
  settingsFingerprint: z.string().min(1),
  variants: z.array(poolQueryVariantSchema).min(1),
});

export const poolCandidateScoresSchema = z.object({
  relevance: z.number(),
  quality: z.number(),
  popularity: z.number(),
  diversity: z.number(),
  jitter: z.number(),
  final: z.number(),
});

export const poolCandidateFeaturesSchema = z.object({
  year: z.number().int(),
  rating: z.number(),
  voteCount: z.number().int().min(0),
  popularity: z.number().min(0),
  genreIds: z.array(z.number().int().positive()),
  dominantGenreId: z.number().int().positive().nullable(),
  originalLanguage: z.string().nullable(),
});

export const poolSourceMovieSchema = movieCandidateSchema.extend({
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
  sourceVariantIds: z.array(z.string().min(1)).min(1),
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
export type PoolQueryFilters = z.infer<typeof poolQueryFiltersSchema>;
export type PoolQueryVariant = z.infer<typeof poolQueryVariantSchema>;
export type PoolPlan = z.infer<typeof poolPlanSchema>;
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

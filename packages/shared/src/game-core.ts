import {z} from "zod";

export const SWIPE_CHOICES = [
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
] as const;

export const gameStatuses = ["lobby", "swiping", "completed"] as const;
export const MOVIE_POPULARITY_PRESETS = [
  "any",
  "balanced",
  "popular",
  "niche",
] as const;

export const swipeChoiceSchema = z.enum(SWIPE_CHOICES);
export const gameStatusSchema = z.enum(gameStatuses);
export const moviePopularityPresetSchema = z.enum(MOVIE_POPULARITY_PRESETS);

const gameplaySettingsSchema = z.object({
  maxMovies: z.number().int().min(1).max(500),
  allowMaybe: z.boolean(),
  allowSuperLike: z.boolean(),
});

export const gameSettingsSchema = z.object({
  gameplay: gameplaySettingsSchema,
});

const gameplaySettingsInputSchema = gameplaySettingsSchema.partial();
export const gameSettingsInputSchema = z.object({
  gameplay: gameplaySettingsInputSchema.optional(),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const gamePreferencesBaseSchema = z.object({
  popularityPreset: moviePopularityPresetSchema,
  includedGenreIds: z.array(z.number().int().positive()).max(10),
  excludedGenreIds: z.array(z.number().int().positive()).max(10),
  preferredProviderIds: z.array(z.number().int().positive()).max(10),
  excludedProviderIds: z.array(z.number().int().positive()).max(10),
  watchRegion: z.string().trim().length(2).toUpperCase(),
  primaryReleaseDateGte: isoDateSchema.nullable(),
  primaryReleaseDateLte: isoDateSchema.nullable(),
  voteAverageGte: z.number().min(0).max(10).nullable(),
  voteAverageLte: z.number().min(0).max(10).nullable(),
});

const addPreferenceIssues = (
  value: {
    includedGenreIds?: number[];
    excludedGenreIds?: number[];
    preferredProviderIds?: number[];
    excludedProviderIds?: number[];
    primaryReleaseDateGte?: string | null;
    primaryReleaseDateLte?: string | null;
    voteAverageGte?: number | null;
    voteAverageLte?: number | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (
    value.primaryReleaseDateGte &&
    value.primaryReleaseDateLte &&
    value.primaryReleaseDateGte > value.primaryReleaseDateLte
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Minimum release date must be earlier than maximum release date",
      path: ["primaryReleaseDateGte"],
    });
  }

  if (
    value.voteAverageGte != null &&
    value.voteAverageLte != null &&
    value.voteAverageGte > value.voteAverageLte
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Minimum rating must be less than or equal to maximum rating",
      path: ["voteAverageGte"],
    });
  }

  const overlappingGenreIds =
    value.includedGenreIds?.filter((genreId) =>
      value.excludedGenreIds?.includes(genreId),
    ) ?? [];

  if (overlappingGenreIds.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: "Included and excluded genres cannot overlap",
      path: ["includedGenreIds"],
    });
  }

  const overlappingProviderIds =
    value.preferredProviderIds?.filter((providerId) =>
      value.excludedProviderIds?.includes(providerId),
    ) ?? [];

  if (overlappingProviderIds.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: "Preferred and excluded providers cannot overlap",
      path: ["preferredProviderIds"],
    });
  }
};

export const gamePreferencesSchema =
  gamePreferencesBaseSchema.superRefine(addPreferenceIssues);

export const gamePreferencesPatchSchema =
  gamePreferencesBaseSchema.partial().superRefine(addPreferenceIssues);

export const movieCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int(),
  overview: z.string(),
  posterUrl: z.string(),
  rating: z.number(),
});

export const gameVoteSummarySchema = z.object({
  movieId: z.string().min(1),
  like: z.number().int().min(0),
  dislike: z.number().int().min(0),
  maybe: z.number().int().min(0),
  superLike: z.number().int().min(0),
  skip: z.number().int().min(0),
  totalVotes: z.number().int().min(0),
  matched: z.boolean(),
  resolvedAt: z.string().datetime().nullable().default(null),
  lastActivityAt: z.string().datetime().nullable().default(null),
  matchedAt: z.string().datetime().nullable().default(null),
});

export const gameQueueItemSchema = z.object({
  movie: movieCandidateSchema,
  order: z.number().int().min(0),
});

export const gamePlayerProgressSchema = z.object({
  playerId: z.string().min(1),
  currentIndex: z.number().int().min(0),
  completed: z.boolean(),
});

export type SwipeChoice = z.infer<typeof swipeChoiceSchema>;
export type GameStatus = z.infer<typeof gameStatusSchema>;
export type MoviePopularityPreset = z.infer<typeof moviePopularityPresetSchema>;
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export type GameSettingsInput = z.infer<typeof gameSettingsInputSchema>;
export type GamePreferences = z.infer<typeof gamePreferencesSchema>;
export type GamePreferencesPatch = z.infer<typeof gamePreferencesPatchSchema>;
export type MovieCandidate = z.infer<typeof movieCandidateSchema>;
export type GameVoteSummary = z.infer<typeof gameVoteSummarySchema>;

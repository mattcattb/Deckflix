import {z} from "zod";

export const swipeChoices = [
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
] as const;

export const gameStatuses = ["lobby", "swiping", "completed"] as const;

export const swipeChoiceSchema = z.enum(swipeChoices);
export const gameStatusSchema = z.enum(gameStatuses);

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const gameplaySettingsSchema = z.object({
  minLikesToMatch: z.number().int().min(1).max(50),
  maxMovies: z.number().int().min(1).max(500),
  allowMaybe: z.boolean(),
  allowSuperLike: z.boolean(),
});

const movieFilterSettingsShape = {
  includedGenreIds: z.array(z.number().int().positive()).max(10),
  excludedGenreIds: z.array(z.number().int().positive()).max(10),
  primaryReleaseDateGte: z.string().regex(isoDatePattern).nullable(),
  primaryReleaseDateLte: z.string().regex(isoDatePattern).nullable(),
  voteAverageGte: z.number().min(0).max(10).nullable(),
  voteAverageLte: z.number().min(0).max(10).nullable(),
} as const;

const addMovieFilterIssues = (
  value: {
    includedGenreIds?: number[];
    excludedGenreIds?: number[];
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
        code: z.ZodIssueCode.custom,
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
        code: z.ZodIssueCode.custom,
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
        code: z.ZodIssueCode.custom,
        message: "Included and excluded genres cannot overlap",
        path: ["includedGenreIds"],
      });
    }
  };

const movieFilterSettingsBaseSchema = z.object(movieFilterSettingsShape);

export const movieFilterSettingsSchema = movieFilterSettingsBaseSchema.superRefine(
  addMovieFilterIssues,
);

export const gameSettingsSchema = z.object({
  gameplay: gameplaySettingsSchema,
  movieFilters: movieFilterSettingsSchema,
});

export const gameplaySettingsInputSchema = gameplaySettingsSchema.partial();
export const movieFilterSettingsInputSchema = movieFilterSettingsBaseSchema
  .partial()
  .superRefine(addMovieFilterIssues);
export const gameSettingsInputSchema = z.object({
  gameplay: gameplaySettingsInputSchema.optional(),
  movieFilters: movieFilterSettingsInputSchema.optional(),
});

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
export type GameplaySettings = z.infer<typeof gameplaySettingsSchema>;
export type MovieFilterSettings = z.infer<typeof movieFilterSettingsSchema>;
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export type GameSettingsInput = z.infer<typeof gameSettingsInputSchema>;
export type MovieCandidate = z.infer<typeof movieCandidateSchema>;
export type GameVoteSummary = z.infer<typeof gameVoteSummarySchema>;
export type GameQueueItem = z.infer<typeof gameQueueItemSchema>;
export type GamePlayerProgress = z.infer<typeof gamePlayerProgressSchema>;

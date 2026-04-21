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

export const gameSettingsSchema = z.object({
  minLikesToMatch: z.number().int().min(1).max(50),
  maxMovies: z.number().int().min(1).max(500),
  allowMaybe: z.boolean(),
  allowSuperLike: z.boolean(),
  selectedGenreIds: z.array(z.number().int().positive()).max(10).optional(),
});

export const gameSettingsInputSchema = gameSettingsSchema.partial();

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
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export type GameSettingsInput = z.infer<typeof gameSettingsInputSchema>;
export type MovieCandidate = z.infer<typeof movieCandidateSchema>;
export type GameVoteSummary = z.infer<typeof gameVoteSummarySchema>;
export type GameQueueItem = z.infer<typeof gameQueueItemSchema>;
export type GamePlayerProgress = z.infer<typeof gamePlayerProgressSchema>;

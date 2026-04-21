import {z} from "zod";
import {
  gameQueueItemSchema,
  gamePlayerProgressSchema,
  gameSettingsInputSchema,
  gameSettingsSchema,
  gameStatusSchema,
  gameVoteSummarySchema,
  swipeChoiceSchema,
} from "./game-core";
import {displaySessionSchema, playerSessionSchema} from "./game-sessions";

export const gamePlayerPresenceSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  connectedAsPlayer: z.boolean(),
});

export const gamePlayerSelfSchema = z.object({
  playerId: z.string().min(1),
  displayName: z.string().min(1).max(40),
  currentIndex: z.number().int().min(0),
  completed: z.boolean(),
});

export const activeGameQueueItemSchema = gameQueueItemSchema.extend({
  assignmentId: z.string().min(1),
});

export const gameSummarySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  roomName: z.string().min(1).max(60).nullable(),
  status: gameStatusSchema,
  createdAt: z.string().datetime(),
  playerCount: z.number().int().min(0),
  queueSize: z.number().int().min(0),
  displayConnected: z.boolean(),
});

export const gameMetaSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
});

export const gamePlayersSchema = z.object({
  players: z.array(gamePlayerPresenceSchema),
});

export const gameResultsSchema = z.object({
  voteSummary: z.array(gameVoteSummarySchema),
  matchedMovieIds: z.array(z.string().min(1)),
  rejectedMovieIds: z.array(z.string().min(1)),
});

export const displayGameStateSchema = z.object({
  summary: gameSummarySchema,
  queue: z.array(gameQueueItemSchema),
  playerProgress: z.array(gamePlayerProgressSchema),
  results: gameResultsSchema,
});

export const playerGameStateSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
  me: gamePlayerSelfSchema,
  currentItem: activeGameQueueItemSchema.nullable().default(null),
  remainingCount: z.number().int().min(0),
});

export const createGamePayloadSchema = z.object({
  roomName: z.string().trim().min(1).max(60).optional(),
  settings: gameSettingsInputSchema.optional(),
});

export const joinGamePayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export const voteGamePayloadSchema = z.object({
  assignmentId: z.string().min(1),
  movieId: z.string().min(1),
  choice: swipeChoiceSchema,
});

export const createGameResultSchema = z.object({
  gameCode: z.string().min(1),
  displaySession: displaySessionSchema,
});

export const joinGameResultSchema = z.object({
  gameCode: z.string().min(1),
  playerSession: playerSessionSchema,
});

export const voteGameResultSchema = z.object({
  state: playerGameStateSchema,
});

export type GamePlayerPresence = z.infer<typeof gamePlayerPresenceSchema>;
export type GamePlayerSelf = z.infer<typeof gamePlayerSelfSchema>;
export type ActiveGameQueueItem = z.infer<typeof activeGameQueueItemSchema>;
export type GameSummary = z.infer<typeof gameSummarySchema>;
export type GameMeta = z.infer<typeof gameMetaSchema>;
export type GamePlayers = z.infer<typeof gamePlayersSchema>;
export type GameResults = z.infer<typeof gameResultsSchema>;
export type DisplayGameState = z.infer<typeof displayGameStateSchema>;
export type PlayerGameState = z.infer<typeof playerGameStateSchema>;
export type CreateGamePayload = z.infer<typeof createGamePayloadSchema>;
export type JoinGamePayload = z.infer<typeof joinGamePayloadSchema>;
export type VoteGamePayload = z.infer<typeof voteGamePayloadSchema>;
export type CreateGameResult = z.infer<typeof createGameResultSchema>;
export type JoinGameResult = z.infer<typeof joinGameResultSchema>;
export type VoteGameResult = z.infer<typeof voteGameResultSchema>;

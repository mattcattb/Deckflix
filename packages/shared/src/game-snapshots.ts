import {z} from "zod";
import {
  gameSettingsInputSchema,
  gameSettingsSchema,
  gameStatusSchema,
  gameVoteSummarySchema,
  movieCandidateSchema,
  swipeChoiceSchema,
} from "./game-core";
import {gameCodeSchema} from "./game-sessions";
import {
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  playerProfileIconIdSchema,
  playerProfileIconIds,
  type PlayerProfileIconId,
} from "./profiles";

export const playerIconIds = playerProfileIconIds;
export const playerIconIdSchema = playerProfileIconIdSchema;

export const gamePlayerPresenceSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(PLAYER_DISPLAY_NAME_MAX_LENGTH),
  iconId: playerIconIdSchema,
  joinedAt: z.string().datetime(),
  connectedAsPlayer: z.boolean(),
});

const gamePlayerProfileSchema = z.object({
  playerId: z.string().min(1),
  displayName: z.string().min(1).max(PLAYER_DISPLAY_NAME_MAX_LENGTH),
  iconId: playerIconIdSchema,
});

const gamePlayerSelfSchema = gamePlayerProfileSchema.extend({
  currentIndex: z.number().int().min(0),
  completed: z.boolean(),
});

const gamePlayerDeckSelfSchema = z.object({
  currentIndex: z.number().int().min(0),
  completed: z.boolean(),
});

const activeGameQueueItemSchema = z.object({
  movie: movieCandidateSchema,
});

const gameSummarySchema = z.object({
  id: z.string().min(1),
  code: gameCodeSchema,
  roomName: z.string().min(1).max(60).nullable(),
  status: gameStatusSchema,
  createdAt: z.string().datetime(),
  playerCount: z.number().int().min(0),
  queueSize: z.number().int().min(0),
});

const gameMetaSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
});

const gamePlayersSchema = z.object({
  players: z.array(gamePlayerPresenceSchema),
});

const gameResultsSchema = z.object({
  voteSummary: z.array(gameVoteSummarySchema),
  matchedMovieIds: z.array(z.string().min(1)),
  rejectedMovieIds: z.array(z.string().min(1)),
});

export const gameActivityItemSchema = z.object({
  movie: movieCandidateSchema,
  votes: gameVoteSummarySchema,
  outcome: z.enum(["match", "rejected", "active"]),
});

export const gameActivitySliceSchema = z.object({
  items: z.array(gameActivityItemSchema),
});

export const playerGameStateSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
  me: gamePlayerSelfSchema,
  currentItem: activeGameQueueItemSchema.nullable().default(null),
  remainingCount: z.number().int().min(0),
});

export const playerRoomStateSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
  me: gamePlayerProfileSchema,
});

export const playerDeckStateSchema = z.object({
  me: gamePlayerDeckSelfSchema,
  currentItem: activeGameQueueItemSchema.nullable().default(null),
  remainingCount: z.number().int().min(0),
});

export const createGamePayloadSchema = z.object({
  roomName: z.string().trim().max(60).optional(),
  settings: gameSettingsInputSchema.optional(),
});

export const joinGamePayloadSchema = z.object({
  displayName: z.string().trim().max(PLAYER_DISPLAY_NAME_MAX_LENGTH).optional(),
});

export const playerProfileInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(PLAYER_DISPLAY_NAME_MAX_LENGTH)
    .optional(),
  iconId: playerIconIdSchema.optional(),
});

export const voteGamePayloadSchema = z.object({
  movieId: z.string().min(1),
  choice: swipeChoiceSchema,
});

export type GamePlayerPresence = z.infer<typeof gamePlayerPresenceSchema>;
export type ActiveGameQueueItem = z.infer<typeof activeGameQueueItemSchema>;
export type GameSummary = z.infer<typeof gameSummarySchema>;
export type GameMeta = z.infer<typeof gameMetaSchema>;
export type GamePlayers = z.infer<typeof gamePlayersSchema>;
export type GameResults = z.infer<typeof gameResultsSchema>;
export type GameActivityItem = z.infer<typeof gameActivityItemSchema>;
export type GameActivitySlice = z.infer<typeof gameActivitySliceSchema>;
export type PlayerGameState = z.infer<typeof playerGameStateSchema>;
export type PlayerRoomState = z.infer<typeof playerRoomStateSchema>;
export type PlayerDeckState = z.infer<typeof playerDeckStateSchema>;
export type PlayerIconId = PlayerProfileIconId;
export type PlayerProfileInput = z.infer<typeof playerProfileInputSchema>;

import {z} from "zod";

export const swipeChoices = [
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
] as const;

export const gameStatuses = ["lobby", "swiping", "completed"] as const;
export const roomRoles = ["display", "player"] as const;

export const movieGenres = [
  "horror",
  "action",
  "comedy",
  "adventure",
  "fantasy",
] as const;
export type MoveGenre = (typeof movieGenres)[number];

export const swipeChoiceSchema = z.enum(swipeChoices);
export const gameStatusSchema = z.enum(gameStatuses);
export const roomRoleSchema = z.enum(roomRoles);

export const gameSettingsSchema = z.object({
  minLikesToMatch: z.number().int().min(1).max(50),
  maxMovies: z.number().int().min(1).max(500),
  allowMaybe: z.boolean(),
  allowSuperLike: z.boolean(),
  selectedGenre: z.enum(movieGenres).optional(),
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

export const gameResultsSchema = z.object({
  voteSummary: z.array(gameVoteSummarySchema),
  matchedMovieIds: z.array(z.string().min(1)),
});

export const gamePublicSnapshotSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
  players: z.array(gamePlayerPresenceSchema),
});

export const displayGameSnapshotSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
  players: z.array(gamePlayerPresenceSchema),
  queue: z.array(gameQueueItemSchema),
  playerProgress: z.array(gamePlayerProgressSchema),
  results: gameResultsSchema,
});

export const playerGameSnapshotSchema = z.object({
  summary: gameSummarySchema,
  settings: gameSettingsSchema,
  players: z.array(gamePlayerPresenceSchema),
  me: gamePlayerSelfSchema,
  currentItem: gameQueueItemSchema.nullable().default(null),
  remainingCount: z.number().int().min(0),
  results: gameResultsSchema,
});

export const displaySessionSchema = z.object({
  gameCode: z.string().min(1),
  displayId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const playerSessionSchema = z.object({
  gameCode: z.string().min(1),
  playerId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const displaySessionAuthSchema = z.object({
  displayId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const playerSessionAuthSchema = z.object({
  playerId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const roomSessionSchema = z.object({
  gameCode: z.string().min(1),
  role: roomRoleSchema,
  roleId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const roomSessionAuthSchema = z.object({
  role: roomRoleSchema,
  roleId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const createGamePayloadSchema = z.object({
  roomName: z.string().trim().min(1).max(60).optional(),
  settings: gameSettingsInputSchema.optional(),
});

export const joinGamePayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export const voteGamePayloadSchema = z.object({
  movieId: z.string().min(1),
  choice: swipeChoiceSchema,
});

export const createGameResultSchema = z.object({
  game: displayGameSnapshotSchema,
  displaySession: displaySessionSchema,
});

export const joinGameResultSchema = z.object({
  game: playerGameSnapshotSchema,
  playerSession: playerSessionSchema,
});

export const voteGameResultSchema = z.object({
  game: playerGameSnapshotSchema,
});

export const roomClientSnapshotSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("display"),
    game: displayGameSnapshotSchema,
  }),
  z.object({
    role: z.literal("player"),
    game: playerGameSnapshotSchema,
  }),
  z.object({
    role: z.literal("none"),
    game: gamePublicSnapshotSchema,
  }),
]);

export const roomSessionSnapshotSchema = roomClientSnapshotSchema;

export const activeRoomClientSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("display"),
    gameCode: z.string().min(1),
    roomName: z.string().min(1).max(60).nullable(),
  }),
  z.object({
    role: z.literal("player"),
    gameCode: z.string().min(1),
    roomName: z.string().min(1).max(60).nullable(),
  }),
  z.object({
    role: z.literal("none"),
  }),
]);

export const activeGameSessionSchema = activeRoomClientSchema;

export const displayClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
]);

export const playerClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
]);

export const displayServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("display.snapshot"),
    payload: displayGameSnapshotSchema,
  }),
  z.object({
    type: z.literal("display.player_joined"),
    payload: gamePlayerPresenceSchema,
  }),
  z.object({
    type: z.literal("display.player_left"),
    payload: z.object({
      playerId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("display.match_found"),
    payload: z.object({
      movieId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("display.error"),
    payload: z.object({
      message: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("pong"),
  }),
]);

export const playerServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("player.snapshot"),
    payload: playerGameSnapshotSchema,
  }),
  z.object({
    type: z.literal("player.vote_recorded"),
    payload: z.object({
      movieId: z.string().min(1),
      choice: swipeChoiceSchema,
    }),
  }),
  z.object({
    type: z.literal("player.match_found"),
    payload: z.object({
      movieId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("player.error"),
    payload: z.object({
      message: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("pong"),
  }),
]);

export type SwipeChoice = z.infer<typeof swipeChoiceSchema>;
export type GameStatus = z.infer<typeof gameStatusSchema>;
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export type GameSettingsInput = z.infer<typeof gameSettingsInputSchema>;
export type MovieCandidate = z.infer<typeof movieCandidateSchema>;
export type GameVoteSummary = z.infer<typeof gameVoteSummarySchema>;
export type GameQueueItem = z.infer<typeof gameQueueItemSchema>;
export type GamePlayerProgress = z.infer<typeof gamePlayerProgressSchema>;
export type GamePlayerPresence = z.infer<typeof gamePlayerPresenceSchema>;
export type GamePlayerSelf = z.infer<typeof gamePlayerSelfSchema>;
export type GameSummary = z.infer<typeof gameSummarySchema>;
export type GameResults = z.infer<typeof gameResultsSchema>;
export type GamePublicSnapshot = z.infer<typeof gamePublicSnapshotSchema>;
export type DisplayGameSnapshot = z.infer<typeof displayGameSnapshotSchema>;
export type PlayerGameSnapshot = z.infer<typeof playerGameSnapshotSchema>;
export type DisplaySession = z.infer<typeof displaySessionSchema>;
export type PlayerSession = z.infer<typeof playerSessionSchema>;
export type DisplaySessionAuth = z.infer<typeof displaySessionAuthSchema>;
export type PlayerSessionAuth = z.infer<typeof playerSessionAuthSchema>;
export type RoomRole = z.infer<typeof roomRoleSchema>;
export type RoomSession = z.infer<typeof roomSessionSchema>;
export type RoomSessionAuth = z.infer<typeof roomSessionAuthSchema>;
export type CreateGamePayload = z.infer<typeof createGamePayloadSchema>;
export type JoinGamePayload = z.infer<typeof joinGamePayloadSchema>;
export type VoteGamePayload = z.infer<typeof voteGamePayloadSchema>;
export type CreateGameResult = z.infer<typeof createGameResultSchema>;
export type JoinGameResult = z.infer<typeof joinGameResultSchema>;
export type VoteGameResult = z.infer<typeof voteGameResultSchema>;
export type RoomClientSnapshot = z.infer<typeof roomClientSnapshotSchema>;
export type RoomSessionSnapshot = z.infer<typeof roomSessionSnapshotSchema>;
export type ActiveRoomClient = z.infer<typeof activeRoomClientSchema>;
export type ActiveGameSession = z.infer<typeof activeGameSessionSchema>;
export type DisplayClientMessage = z.infer<typeof displayClientMessageSchema>;
export type PlayerClientMessage = z.infer<typeof playerClientMessageSchema>;
export type DisplayServerMessage = z.infer<typeof displayServerMessageSchema>;
export type PlayerServerMessage = z.infer<typeof playerServerMessageSchema>;

const parseJson = (raw: string) => JSON.parse(raw) as unknown;

export const decodeDisplayClientMessage = (raw: string): DisplayClientMessage =>
  displayClientMessageSchema.parse(parseJson(raw));

export const decodePlayerClientMessage = (raw: string): PlayerClientMessage =>
  playerClientMessageSchema.parse(parseJson(raw));

export const decodeDisplayServerMessage = (raw: string): DisplayServerMessage =>
  displayServerMessageSchema.parse(parseJson(raw));

export const decodePlayerServerMessage = (raw: string): PlayerServerMessage =>
  playerServerMessageSchema.parse(parseJson(raw));

export const parseDisplayServerMessage = (
  raw: string,
): DisplayServerMessage | null => {
  try {
    return decodeDisplayServerMessage(raw);
  } catch {
    return null;
  }
};

export const parsePlayerServerMessage = (
  raw: string,
): PlayerServerMessage | null => {
  try {
    return decodePlayerServerMessage(raw);
  } catch {
    return null;
  }
};

export const encodeDisplayServerMessage = (message: DisplayServerMessage) =>
  JSON.stringify(displayServerMessageSchema.parse(message));

export const encodePlayerServerMessage = (message: PlayerServerMessage) =>
  JSON.stringify(playerServerMessageSchema.parse(message));

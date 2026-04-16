import {z} from "zod";

export const swipeChoices = [
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
] as const;

export const roomStatuses = ["lobby", "swiping", "completed"] as const;
export const memberRoles = ["host", "guest"] as const;

export const swipeChoiceSchema = z.enum(swipeChoices);
export const roomStatusSchema = z.enum(roomStatuses);
export const memberRoleSchema = z.enum(memberRoles);

export const roomSettingsSchema = z.object({
  minLikesToMatch: z.number().int().min(1).max(50),
  maxMovies: z.number().int().min(1).max(500),
  allowMaybe: z.boolean(),
  allowSuperLike: z.boolean(),
});

export const roomSettingsInputSchema = roomSettingsSchema.partial();

export const movieCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int(),
  overview: z.string(),
  posterUrl: z.string(),
  rating: z.number(),
});

export const movieVoteSummarySchema = z.object({
  movieId: z.string().min(1),
  like: z.number().int().min(0),
  dislike: z.number().int().min(0),
  maybe: z.number().int().min(0),
  superLike: z.number().int().min(0),
  skip: z.number().int().min(0),
  totalVotes: z.number().int().min(0),
  matched: z.boolean(),
});

export const roomDeckItemSchema = z.object({
  movie: movieCandidateSchema,
  order: z.number().int().min(0),
  votes: movieVoteSummarySchema,
});

export const roomMemberProgressSchema = z.object({
  memberId: z.string().min(1),
  currentIndex: z.number().int().min(0),
  completed: z.boolean(),
});

export const roomMemberSnapshotSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  role: memberRoleSchema,
  joinedAt: z.string().datetime(),
  connected: z.boolean(),
});

export const roomSnapshotSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  viewerMemberId: z.string().min(1).nullable().default(null),
  status: roomStatusSchema,
  createdAt: z.string().datetime(),
  hostMemberId: z.string().min(1),
  settings: roomSettingsSchema,
  members: z.array(roomMemberSnapshotSchema),
  movies: z.array(movieCandidateSchema),
  voteSummary: z.array(movieVoteSummarySchema),
  deck: z.object({
    items: z.array(roomDeckItemSchema),
    memberProgress: z.array(roomMemberProgressSchema),
    totalCards: z.number().int().min(0),
  }),
});

export const roomSessionSchema = z.object({
  roomCode: z.string().min(1),
  memberId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const roomParticipantSessionSchema = z.object({
  memberId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const createRoomPayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  settings: roomSettingsInputSchema.optional(),
});

export const joinRoomPayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export const swipeRoomPayloadSchema = z.object({
  movieId: z.string().min(1),
  choice: swipeChoiceSchema,
});

export const createRoomResultSchema = z.object({
  room: roomSnapshotSchema,
  session: roomSessionSchema,
});

export const joinRoomResultSchema = z.object({
  room: roomSnapshotSchema,
  session: roomSessionSchema,
});

export const roomClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
]);

export const roomServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room.snapshot"),
    payload: roomSnapshotSchema,
  }),
  z.object({
    type: z.literal("room.card_complete"),
    payload: movieVoteSummarySchema,
  }),
  z.object({
    type: z.literal("room.match_found"),
    payload: z.object({
      movieId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("room.error"),
    payload: z.object({
      message: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("pong"),
  }),
]);

export type SwipeChoice = z.infer<typeof swipeChoiceSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type MemberRole = z.infer<typeof memberRoleSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type RoomSettingsInput = z.infer<typeof roomSettingsInputSchema>;
export type MovieCandidate = z.infer<typeof movieCandidateSchema>;
export type MovieVoteSummary = z.infer<typeof movieVoteSummarySchema>;
export type RoomDeckItem = z.infer<typeof roomDeckItemSchema>;
export type RoomMemberProgress = z.infer<typeof roomMemberProgressSchema>;
export type RoomMemberSnapshot = z.infer<typeof roomMemberSnapshotSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomSession = z.infer<typeof roomSessionSchema>;
export type RoomParticipantSession = z.infer<typeof roomParticipantSessionSchema>;
export type CreateRoomPayload = z.infer<typeof createRoomPayloadSchema>;
export type JoinRoomPayload = z.infer<typeof joinRoomPayloadSchema>;
export type SwipeRoomPayload = z.infer<typeof swipeRoomPayloadSchema>;
export type CreateRoomResult = z.infer<typeof createRoomResultSchema>;
export type JoinRoomResult = z.infer<typeof joinRoomResultSchema>;
export type RoomClientMessage = z.infer<typeof roomClientMessageSchema>;
export type RoomServerMessage = z.infer<typeof roomServerMessageSchema>;

const parseJson = (raw: string) => JSON.parse(raw) as unknown;

export const decodeRoomClientMessage = (raw: string): RoomClientMessage =>
  roomClientMessageSchema.parse(parseJson(raw));

export const decodeRoomServerMessage = (raw: string): RoomServerMessage =>
  roomServerMessageSchema.parse(parseJson(raw));

export const parseRoomClientMessage = (raw: string): RoomClientMessage | null => {
  try {
    return roomClientMessageSchema.parse(parseJson(raw));
  } catch {
    return null;
  }
};

export const parseRoomServerMessage = (raw: string): RoomServerMessage | null => {
  try {
    return roomServerMessageSchema.parse(parseJson(raw));
  } catch {
    return null;
  }
};

export const encodeRoomClientMessage = (message: RoomClientMessage) =>
  JSON.stringify(roomClientMessageSchema.parse(message));

export const encodeRoomServerMessage = (message: RoomServerMessage) =>
  JSON.stringify(roomServerMessageSchema.parse(message));

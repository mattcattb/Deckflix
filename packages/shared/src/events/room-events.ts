import {z} from "zod";
import {gameStatusSchema} from "../game-core";
import {gameCodeSchema} from "../game-sessions";

export const roomStartedEventSchema = z.object({
  type: z.literal("room.started"),
  gameCode: gameCodeSchema,
});

export const roomStatusChangedEventSchema = z.object({
  type: z.literal("room.status_changed"),
  gameCode: gameCodeSchema,
  previousStatus: gameStatusSchema,
  nextStatus: gameStatusSchema,
});

export const roomDeletedEventSchema = z.object({
  type: z.literal("room.deleted"),
  gameCode: gameCodeSchema,
});

export type RoomStartedEvent = z.infer<typeof roomStartedEventSchema>;
export type RoomStatusChangedEvent = z.infer<typeof roomStatusChangedEventSchema>;
export type RoomDeletedEvent = z.infer<typeof roomDeletedEventSchema>;

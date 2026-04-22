import {z} from "zod";
import {gameStatusSchema} from "../game-core";

export const roomStartedEventSchema = z.object({
  type: z.literal("room.started"),
});

export const roomStatusChangedEventSchema = z.object({
  type: z.literal("room.status_changed"),
  payload: z.object({
    previousStatus: gameStatusSchema,
    nextStatus: gameStatusSchema,
  }),
});

export const roomDeletedEventSchema = z.object({
  type: z.literal("room.deleted"),
});

export type RoomStartedEvent = z.infer<typeof roomStartedEventSchema>;
export type RoomStatusChangedEvent = z.infer<typeof roomStatusChangedEventSchema>;
export type RoomDeletedEvent = z.infer<typeof roomDeletedEventSchema>;

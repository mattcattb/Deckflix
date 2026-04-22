import {z} from "zod";
import {gamePlayerPresenceSchema} from "../game-snapshots";

export const presencePlayerJoinedEventSchema = z.object({
  type: z.literal("presence.player_joined"),
  payload: gamePlayerPresenceSchema,
});

export const presencePlayerLeftEventSchema = z.object({
  type: z.literal("presence.player_left"),
  payload: z.object({
    playerId: z.string().min(1),
  }),
});

export type PresencePlayerJoinedEvent = z.infer<typeof presencePlayerJoinedEventSchema>;
export type PresencePlayerLeftEvent = z.infer<typeof presencePlayerLeftEventSchema>;

import {z} from "zod";
import {gamePlayerPresenceSchema} from "../game-snapshots";
import {gameCodeSchema} from "../game-sessions";

export const playerJoinedEventSchema = z.object({
  type: z.literal("player.joined"),
  gameCode: gameCodeSchema,
  player: gamePlayerPresenceSchema,
});

export const playerLeftEventSchema = z.object({
  type: z.literal("player.left"),
  gameCode: gameCodeSchema,
  playerId: z.string().min(1),
});

export const playerConnectedEventSchema = z.object({
  type: z.literal("player.connected"),
  gameCode: gameCodeSchema,
  playerId: z.string().min(1),
});

export const playerDisconnectedEventSchema = z.object({
  type: z.literal("player.disconnected"),
  gameCode: gameCodeSchema,
  playerId: z.string().min(1),
});

export type PlayerJoinedEvent = z.infer<typeof playerJoinedEventSchema>;
export type PlayerLeftEvent = z.infer<typeof playerLeftEventSchema>;
export type PlayerConnectedEvent = z.infer<typeof playerConnectedEventSchema>;
export type PlayerDisconnectedEvent = z.infer<typeof playerDisconnectedEventSchema>;

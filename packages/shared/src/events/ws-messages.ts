import {z} from "zod";
import {playerGameStateSchema} from "../game-snapshots";
import {
  playerConnectedEventSchema,
  playerDisconnectedEventSchema,
  playerJoinedEventSchema,
  playerLeftEventSchema,
} from "./player-events";
import {
  roomDeletedEventSchema,
  roomStartedEventSchema,
  roomStatusChangedEventSchema,
} from "./room-events";
import {
  socketErrorEventSchema,
  socketPingEventSchema,
  socketPongEventSchema,
} from "./socket-events";
import {
  gameMatchFoundEventSchema,
  gameVoteRecordedEventSchema,
} from "./game-events";

export const displayClientMessageSchema = z.discriminatedUnion("type", [
  socketPingEventSchema,
]);

export const playerClientMessageSchema = z.discriminatedUnion("type", [
  socketPingEventSchema,
]);

export const playerSnapshotEventSchema = z.object({
  type: z.literal("player.snapshot"),
  payload: playerGameStateSchema,
});

export const displayServerMessageSchema = z.discriminatedUnion("type", [
  roomStartedEventSchema,
  roomStatusChangedEventSchema,
  roomDeletedEventSchema,
  playerJoinedEventSchema,
  playerLeftEventSchema,
  playerConnectedEventSchema,
  playerDisconnectedEventSchema,
  gameVoteRecordedEventSchema,
  gameMatchFoundEventSchema,
  socketErrorEventSchema,
  socketPongEventSchema,
]);

export const playerServerMessageSchema = z.discriminatedUnion("type", [
  playerSnapshotEventSchema,
  roomStatusChangedEventSchema,
  roomDeletedEventSchema,
  gameVoteRecordedEventSchema,
  gameMatchFoundEventSchema,
  socketErrorEventSchema,
  socketPongEventSchema,
]);

export type DisplayClientMessage = z.infer<typeof displayClientMessageSchema>;
export type PlayerClientMessage = z.infer<typeof playerClientMessageSchema>;
export type DisplayServerMessage = z.infer<typeof displayServerMessageSchema>;
export type PlayerServerMessage = z.infer<typeof playerServerMessageSchema>;

const parseJson = (raw: string) => JSON.parse(raw) as unknown;

export const decodeDisplayClientMessage = (raw: string) =>
  displayClientMessageSchema.parse(parseJson(raw));

export const decodePlayerClientMessage = (raw: string) =>
  playerClientMessageSchema.parse(parseJson(raw));

const decodeDisplayServerMessage = (raw: string): DisplayServerMessage =>
  displayServerMessageSchema.parse(parseJson(raw));

const decodePlayerServerMessage = (raw: string): PlayerServerMessage =>
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

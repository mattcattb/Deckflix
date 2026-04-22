import {z} from "zod";
import {swipeChoiceSchema} from "./game-core";
import {
  displayGameStateSchema,
  gamePlayerPresenceSchema,
  playerGameStateSchema,
} from "./game-snapshots";

const displayClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
]);

const playerClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
]);

const displayServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("display.snapshot"),
    payload: displayGameStateSchema,
  }),
  z.object({
    type: z.literal("display.room_ended"),
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

const playerServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("player.snapshot"),
    payload: playerGameStateSchema,
  }),
  z.object({
    type: z.literal("player.room_ended"),
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

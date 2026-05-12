import {z} from "zod";
import {
  gameMatchFoundEventSchema,
  gameVoteRecordedEventSchema,
} from "./game-events";
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

export const appEventSchema = z.discriminatedUnion("type", [
  playerJoinedEventSchema,
  playerLeftEventSchema,
  playerConnectedEventSchema,
  playerDisconnectedEventSchema,
  roomStatusChangedEventSchema,
  roomStartedEventSchema,
  roomDeletedEventSchema,
  gameVoteRecordedEventSchema,
  gameMatchFoundEventSchema,
]);

export type AppEvent = z.infer<typeof appEventSchema>;

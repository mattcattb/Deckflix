import {z} from "zod";
import {
  gameMatchFoundEventSchema,
  gameVoteRecordedEventSchema,
} from "./game-events";
import {
  playerConnectedEventSchema,
  playerDisconnectedEventSchema,
  playerJoinedEventSchema,
  playerKickedEventSchema,
  playerLeftEventSchema,
  playerUpdatedEventSchema,
} from "./player-events";
import {
  roomDeletedEventSchema,
  roomStartedEventSchema,
  roomStatusChangedEventSchema,
} from "./room-events";

export const appEventSchema = z.discriminatedUnion("type", [
  playerJoinedEventSchema,
  playerLeftEventSchema,
  playerKickedEventSchema,
  playerUpdatedEventSchema,
  playerConnectedEventSchema,
  playerDisconnectedEventSchema,
  roomStatusChangedEventSchema,
  roomStartedEventSchema,
  roomDeletedEventSchema,
  gameVoteRecordedEventSchema,
  gameMatchFoundEventSchema,
]);

export type AppEvent = z.infer<typeof appEventSchema>;

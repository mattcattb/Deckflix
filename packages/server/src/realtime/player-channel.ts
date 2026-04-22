import {
  encodePlayerServerMessage,
  type PlayerServerMessage,
} from "@deckflix/shared";
import {
  normalizeRealtimeKey,
  publishSocketPayload,
  subscribeSocketTopic,
  type RealtimeServer,
  type TopicSocket,
  unsubscribeSocketTopic,
} from "./socket-bus";

export const getPlayerTopic = (gameCode: string, playerId: string) =>
  `ws:player:${normalizeRealtimeKey(gameCode)}:${playerId}`;

export const subscribePlayerSocket = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  subscribeSocketTopic(ws, getPlayerTopic(gameCode, playerId));
};

export const unsubscribePlayerSocket = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  unsubscribeSocketTopic(ws, getPlayerTopic(gameCode, playerId));
};

export const publishPlayerMessage = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
  message: PlayerServerMessage,
) => {
  publishSocketPayload(
    server,
    getPlayerTopic(gameCode, playerId),
    encodePlayerServerMessage(message),
  );
};

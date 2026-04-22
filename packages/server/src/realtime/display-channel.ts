import {
  encodeDisplayServerMessage,
  type DisplayServerMessage,
} from "@deckflix/shared";
import {
  normalizeRealtimeKey,
  publishSocketPayload,
  subscribeSocketTopic,
  type RealtimeServer,
  type TopicSocket,
  unsubscribeSocketTopic,
} from "./socket-bus";

export const getDisplayTopic = (gameCode: string) =>
  `ws:display:${normalizeRealtimeKey(gameCode)}`;

export const subscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  subscribeSocketTopic(ws, getDisplayTopic(gameCode));
};

export const unsubscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  unsubscribeSocketTopic(ws, getDisplayTopic(gameCode));
};

export const publishDisplayMessage = (
  server: RealtimeServer,
  gameCode: string,
  message: DisplayServerMessage,
) => {
  publishSocketPayload(
    server,
    getDisplayTopic(gameCode),
    encodeDisplayServerMessage(message),
  );
};

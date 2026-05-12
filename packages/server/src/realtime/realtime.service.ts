import type {ServerWebSocket} from "bun";
import type {WSContext} from "hono/ws";
import {
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
  type DisplayServerMessage,
  type PlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {publishSocketTopic} from "./socket-pubsub.service";

export type RealtimeServer = {
  publish: (topic: string, payload: string) => void;
};

export type TopicSocket = Pick<WSContext<ServerWebSocket<unknown>>, "raw">;

const normalizeRealtimeKey = (value: string) =>
  value.trim().toUpperCase();

const subscribeSocketTopic = (
  ws: TopicSocket,
  topic: string | string[],
) => {
  const topics = Array.isArray(topic) ? topic : [topic];
  for (const item of topics) {
    ws.raw?.subscribe(item);
  }
};

const unsubscribeSocketTopic = (
  ws: TopicSocket,
  topic: string | string[],
) => {
  const topics = Array.isArray(topic) ? topic : [topic];
  for (const item of topics) {
    ws.raw?.unsubscribe(item);
  }
};

const publishSocketPayload = (
  server: RealtimeServer,
  topic: string,
  payload: string,
) => {
  server.publish(topic, payload);
  void publishSocketTopic(topic, payload);
};

const TOPICS = {
  overall: (gameCode: string) => `ws:all:${normalizeRealtimeKey(gameCode)}`,
  display: (gameCode: string) =>
    `ws:display:${normalizeRealtimeKey(gameCode)}`,
  player: (gameCode: string, playerId: string) =>
    `ws:player:${normalizeRealtimeKey(gameCode)}:${playerId}`,
};

export const getDisplayTopic = TOPICS.display;
export const getPlayerTopic = TOPICS.player;

export const subscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  subscribeSocketTopic(ws, [TOPICS.display(gameCode), TOPICS.overall(gameCode)]);
};

export const unsubscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  unsubscribeSocketTopic(ws, [
    TOPICS.display(gameCode),
    TOPICS.overall(gameCode),
  ]);
};

export const subscribePlayerSocket = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  subscribeSocketTopic(ws, [
    TOPICS.player(gameCode, playerId),
    TOPICS.overall(gameCode),
  ]);
};

export const unsubscribePlayerSocket = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  unsubscribeSocketTopic(ws, [
    TOPICS.player(gameCode, playerId),
    TOPICS.overall(gameCode),
  ]);
};

export const publishDisplayMessage = (
  server: RealtimeServer,
  gameCode: string,
  message: DisplayServerMessage,
) => {
  publishSocketPayload(
    server,
    TOPICS.display(gameCode),
    encodeDisplayServerMessage(message),
  );
};

export const publishPlayerMessage = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
  message: PlayerServerMessage,
) => {
  publishSocketPayload(
    server,
    TOPICS.player(gameCode, playerId),
    encodePlayerServerMessage(message),
  );
};

export const publishRoomMessage = (
  server: RealtimeServer,
  gameCode: string,
  message: DisplayServerMessage & PlayerServerMessage,
) => {
  publishSocketPayload(
    server,
    TOPICS.overall(gameCode),
    encodeDisplayServerMessage(message),
  );
};

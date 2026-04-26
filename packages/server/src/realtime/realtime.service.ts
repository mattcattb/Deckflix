import type {ServerWebSocket} from "bun";
import type {WSContext} from "hono/ws";
import {
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
  type DisplayServerMessage,
  type PlayerServerMessage,
} from "@deckflix/shared/game-messages";
import * as RedisLib from "../lib/redis";

export type RealtimeServer = {
  publish: (topic: string, payload: string) => void;
};

export type TopicSocket = Pick<WSContext<ServerWebSocket<unknown>>, "raw">;

export const normalizeRealtimeKey = (value: string) => value.trim().toUpperCase();

export const subscribeSocketTopic = (ws: TopicSocket, topic: string) => {
  ws.raw?.subscribe(topic);
};

export const unsubscribeSocketTopic = (ws: TopicSocket, topic: string) => {
  ws.raw?.unsubscribe(topic);
};

export const publishSocketPayload = (
  server: RealtimeServer,
  topic: string,
  payload: string,
) => {
  server.publish(topic, payload);
  if ("publishSocketTopic" in RedisLib) {
    void RedisLib.publishSocketTopic(topic, payload);
  }
};

export const getDisplayTopic = (gameCode: string) =>
  `ws:display:${normalizeRealtimeKey(gameCode)}`;

export const getPlayerTopic = (gameCode: string, playerId: string) =>
  `ws:player:${normalizeRealtimeKey(gameCode)}:${playerId}`;

export const subscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  subscribeSocketTopic(ws, getDisplayTopic(gameCode));
};

export const unsubscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  unsubscribeSocketTopic(ws, getDisplayTopic(gameCode));
};

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

import type {Server, ServerWebSocket} from "bun";
import type {BunWebSocketData} from "hono/bun";
import type {WSContext} from "hono/ws";
import {
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
  type DisplayServerMessage,
  type PlayerServerMessage,
} from "@deckflix/shared";
import {publishSocketTopic} from "../lib/redis";

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

export const SOCKET_TOPICS = {
  getDisplay: (gameCode: string) => `ws:display:${normalizeGameCode(gameCode)}`,
  getPlayer: (gameCode: string, playerId: string) =>
    `ws:player:${normalizeGameCode(gameCode)}:${playerId}`,
};

type TopicSocket = Pick<WSContext<ServerWebSocket<unknown>>, "raw">;

export const subscribeToDisplay = (ws: TopicSocket, gameCode: string) => {
  ws.raw?.subscribe(SOCKET_TOPICS.getDisplay(gameCode));
};

export const unsubscribeFromDisplay = (ws: TopicSocket, gameCode: string) => {
  ws.raw?.unsubscribe(SOCKET_TOPICS.getDisplay(gameCode));
};

export const subscribeToPlayer = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  ws.raw?.subscribe(SOCKET_TOPICS.getPlayer(gameCode, playerId));
};

export const unsubscribeFromPlayer = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  ws.raw?.unsubscribe(SOCKET_TOPICS.getPlayer(gameCode, playerId));
};

const publishSocketPayload = (
  server: Server<BunWebSocketData>,
  topic: string,
  payload: string,
) => {
  server.publish(topic, payload);
  void publishSocketTopic(topic, payload);
};

export const publishDisplayMessage = (
  server: Server<BunWebSocketData>,
  gameCode: string,
  message: DisplayServerMessage,
) => {
  publishSocketPayload(
    server,
    SOCKET_TOPICS.getDisplay(gameCode),
    encodeDisplayServerMessage(message),
  );
};

export const publishPlayerMessage = (
  server: Server<BunWebSocketData>,
  gameCode: string,
  playerId: string,
  message: PlayerServerMessage,
) => {
  publishSocketPayload(
    server,
    SOCKET_TOPICS.getPlayer(gameCode, playerId),
    encodePlayerServerMessage(message),
  );
};

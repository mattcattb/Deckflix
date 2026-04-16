import type {Server, ServerWebSocket} from "bun";
import type {BunWebSocketData} from "hono/bun";
import type {WSContext} from "hono/ws";
import {
  encodeRoomServerMessage,
  type RoomServerMessage,
} from "@deckflix/shared";
import {publishSocketTopic} from "../lib/redis";

const normalizeRoomCode = (roomCode: string) => roomCode.trim().toUpperCase();

export const SOCKET_TOPICS = {
  getBroadcast: () => "ws:broadcast",
  getMember: (memberId: string) => `ws:member:${memberId}`,
  getRoom: (roomCode: string) => `ws:room:${normalizeRoomCode(roomCode)}`,
};

type TopicSocket = Pick<WSContext<ServerWebSocket<unknown>>, "raw">;

export const subscribeToRoom = (ws: TopicSocket, roomCode: string) => {
  ws.raw?.subscribe(SOCKET_TOPICS.getRoom(roomCode));
};

export const unsubscribeFromRoom = (ws: TopicSocket, roomCode: string) => {
  ws.raw?.unsubscribe(SOCKET_TOPICS.getRoom(roomCode));
};

const publishSocketMessage = (
  server: Server<BunWebSocketData>,
  topic: string,
  message: RoomServerMessage,
) => {
  const payload = encodeRoomServerMessage(message);
  server.publish(topic, payload);
  void publishSocketTopic(topic, payload);
};

export const publishBroadcastMessage = (
  server: Server<BunWebSocketData>,
  message: RoomServerMessage,
) => {
  publishSocketMessage(server, SOCKET_TOPICS.getBroadcast(), message);
};

export const publishMemberMessage = (
  server: Server<BunWebSocketData>,
  memberId: string,
  message: RoomServerMessage,
) => {
  publishSocketMessage(server, SOCKET_TOPICS.getMember(memberId), message);
};

export const publishRoomMessage = (
  server: Server<BunWebSocketData>,
  roomCode: string,
  message: RoomServerMessage,
) => {
  publishSocketMessage(server, SOCKET_TOPICS.getRoom(roomCode), message);
};

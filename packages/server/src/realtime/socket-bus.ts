import type {ServerWebSocket} from "bun";
import type {WSContext} from "hono/ws";
import {publishSocketTopic} from "../lib/redis";

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
  void publishSocketTopic(topic, payload);
};

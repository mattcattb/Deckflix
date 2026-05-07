import {randomUUID} from "node:crypto";
import type {Server} from "bun";
import type {BunWebSocketData} from "hono/bun";
import {z} from "zod";
import {logger} from "../common/logger";
import {
  connectRedisClient,
  redisClient,
  redisSubscriber,
} from "../redis/redis";

const SOCKET_PUBSUB_CHANNEL = "deckflix:ws:fanout";
const socketPubSubSourceId = randomUUID();

const socketPubsubEnvelopeSchema = z.object({
  sourceId: z.string().min(1),
  topic: z.string().min(1),
  payload: z.string().min(1),
});

let socketServer: Server<BunWebSocketData> | null = null;
let socketPubSubPromise: Promise<void> | null = null;

const forwardRedisSocketMessage = (rawMessage: string) => {
  if (!socketServer) return;

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawMessage);
  } catch (error) {
    logger.error({error, rawMessage}, "Invalid socket Redis payload");
    return;
  }

  const parsedEnvelope = socketPubsubEnvelopeSchema.safeParse(parsedJson);
  if (!parsedEnvelope.success) {
    logger.error(
      {error: parsedEnvelope.error, rawMessage},
      "Socket Redis payload failed validation",
    );
    return;
  }

  if (parsedEnvelope.data.sourceId === socketPubSubSourceId) {
    return;
  }

  socketServer.publish(parsedEnvelope.data.topic, parsedEnvelope.data.payload);
};

export const ensureSocketPubSub = (server: Server<BunWebSocketData>) => {
  socketServer = server;

  if (socketPubSubPromise) {
    return socketPubSubPromise;
  }

  socketPubSubPromise = (async () => {
    await connectRedisClient(redisClient);
    await connectRedisClient(redisSubscriber);
    await redisSubscriber.subscribe(
      SOCKET_PUBSUB_CHANNEL,
      forwardRedisSocketMessage,
    );
  })();

  socketPubSubPromise.catch((error) => {
    logger.error({error}, "Failed to start socket Redis bridge");
  });

  return socketPubSubPromise;
};

export const publishSocketTopic = async (topic: string, payload: string) => {
  await connectRedisClient(redisClient);
  await redisClient.publish(
    SOCKET_PUBSUB_CHANNEL,
    JSON.stringify({
      sourceId: socketPubSubSourceId,
      topic,
      payload,
    }),
  );
};

import {createClient} from "redis";
import {appEnv} from "../common/env";
import {logger} from "../common/logger";

export const redisClient = createClient({
  url: appEnv.REDIS_URL,
});

export const redisSubscriber = redisClient.duplicate();

const onRedisError = (error: unknown) => {
  logger.error({error}, "Redis error");
};

redisClient.on("error", onRedisError);
redisSubscriber.on("error", onRedisError);

const connectRedisClient = async (client: typeof redisClient) => {
  if (!client.isOpen) {
    await client.connect();
  }
};

export const connectRedis = async () => {
  await connectRedisClient(redisClient);
  await connectRedisClient(redisSubscriber);
};

export const disconnectRedis = async () => {
  if (redisSubscriber.isOpen) {
    await redisSubscriber.destroy();
  }

  if (redisClient.isOpen) {
    await redisClient.destroy();
  }
};

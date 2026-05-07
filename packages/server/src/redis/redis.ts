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

export const connectRedisClient = async (client: typeof redisClient) => {
  if (!client.isOpen) {
    await client.connect();
  }
};

export const ensureRedis = () => connectRedisClient(redisClient);

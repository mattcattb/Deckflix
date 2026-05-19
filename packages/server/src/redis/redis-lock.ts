import {randomUUID} from "node:crypto";
import {BadRequestException} from "../common/errors";
import {redisClient} from "./redis";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const releaseRedisLock = async (key: string, token: string) => {
  await redisClient.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    {
      keys: [key],
      arguments: [token],
    },
  );
};

export const withRedisLock = async <T>(
  input: {
    key: string;
    ttlMs: number;
    retryCount: number;
    retryDelayMs: number;
    busyMessage?: string;
  },
  callback: () => Promise<T>,
) => {
  const token = randomUUID();

  for (let attempt = 0; attempt < input.retryCount; attempt += 1) {
    const locked = await redisClient.set(input.key, token, {
      NX: true,
      PX: input.ttlMs,
    });

    if (!locked) {
      await sleep(input.retryDelayMs);
      continue;
    }

    try {
      return await callback();
    } finally {
      await releaseRedisLock(input.key, token);
    }
  }

  throw new BadRequestException(input.busyMessage ?? "Resource is busy");
};

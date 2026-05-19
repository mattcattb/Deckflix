import {afterAll, beforeAll} from "bun:test";
import {connectRedis, disconnectRedis} from "../redis/redis";

beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await disconnectRedis();
});

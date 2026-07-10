import {randomUUID} from "node:crypto";
import {afterEach, describe, expect, test} from "bun:test";
import {redisClient} from "../redis/redis";
import {roomPrefix} from "../rooms/room-keys";
import * as PoolService from "./pool.service";

const usedGameCodes: string[] = [];
const poolKey = (gameCode: string) => `${roomPrefix(gameCode)}pool`;
const poolSignalsKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}pool_signals`;

const createGameCode = () => {
  const gameCode = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  usedGameCodes.push(gameCode);
  return gameCode;
};

afterEach(async () => {
  if (usedGameCodes.length > 0) {
    await redisClient.del([
      ...usedGameCodes.map(poolKey),
      ...usedGameCodes.map(poolSignalsKey),
    ]);
    usedGameCodes.length = 0;
  }
});

describe("pool.service", () => {
  test("stores, appends, deduplicates, and lists ordered movie ids", async () => {
    const gameCode = createGameCode();
    await PoolService.replacePool(gameCode, ["movie-1", "movie-2"]);

    expect(await redisClient.lRange(poolKey(gameCode), 0, -1)).toEqual([
      "movie-1",
      "movie-2",
    ]);
    expect(await PoolService.getPoolSize(gameCode)).toBe(2);

    const appended = await PoolService.appendPoolMovieIds(gameCode, [
      "movie-2",
      "movie-3",
    ]);

    expect(appended).toEqual(["movie-3"]);
    expect(await redisClient.lRange(poolKey(gameCode), 0, -1)).toEqual([
      "movie-1",
      "movie-2",
      "movie-3",
    ]);
    await PoolService.replacePool(gameCode, ["movie-1", "movie-2"]);

    await expect(PoolService.listPoolEntries(gameCode)).resolves.toEqual([
      {movieId: "movie-1", order: 0},
      {movieId: "movie-2", order: 1},
    ]);
  });

  test("stores weighted recommendation signals in one sorted set", async () => {
    const gameCode = createGameCode();
    await PoolService.addPoolSignal(gameCode, "movie-1", 2);
    await PoolService.addPoolSignal(gameCode, "movie-1", 0.4);
    await PoolService.addPoolSignal(gameCode, "movie-2", -1.5);

    await expect(
      PoolService.getPoolSignals(gameCode, ["movie-1", "movie-2", "new"]),
    ).resolves.toEqual(
      new Map([
        ["movie-1", 2.4],
        ["movie-2", -1.5],
        ["new", 0],
      ]),
    );
  });
});

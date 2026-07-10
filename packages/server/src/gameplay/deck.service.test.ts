import {describe, expect, test} from "bun:test";
import * as DeckService from "./deck.service";
import {redisClient} from "../redis/redis";

describe("deck.service", () => {
  test("orders pool entries in stable per-player windows", () => {
    const entries = [
      {movieId: "movie-4", order: 4},
      {movieId: "movie-1", order: 1},
      {movieId: "movie-7", order: 7},
      {movieId: "movie-0", order: 0},
    ];

    const first = DeckService.orderPoolEntriesForPlayer(
      entries,
      "seed",
      "player-1",
    );
    const second = DeckService.orderPoolEntriesForPlayer(
      entries,
      "seed",
      "player-1",
    );

    expect(first).toEqual(second);
    expect(first.slice(0, 3).every((entry) => entry.order < 6)).toBe(true);
  });

  test("promotes positively signaled movies without removing player diversity", () => {
    const entries = Array.from({length: 8}, (_, order) => ({
      movieId: `movie-${order}`,
      order,
    }));
    const signals = new Map([["movie-5", 4]]);

    const first = DeckService.orderPoolEntriesForPlayer(
      entries,
      "seed",
      "player-1",
      signals,
    );
    const second = DeckService.orderPoolEntriesForPlayer(
      entries,
      "seed",
      "player-2",
      signals,
    );

    expect(first[0]?.movieId).toBe("movie-5");
    expect(second[0]?.movieId).toBe("movie-5");
    expect(first.slice(1, 6)).not.toEqual(second.slice(1, 6));
  });

  test("only pops the expected deck head under concurrent requests", async () => {
    const gameCode = "ATOM";
    const playerId = "player-1";
    const key = `game:${gameCode}:deck:${playerId}`;
    await redisClient.del(key);
    await redisClient.rPush(key, ["movie-1", "movie-2"]);

    const [first, second] = await Promise.all([
      DeckService.popCurrentMovieId(gameCode, playerId, "movie-1"),
      DeckService.popCurrentMovieId(gameCode, playerId, "movie-1"),
    ]);

    expect([first.status, second.status].sort()).toEqual(["mismatch", "ok"]);
    expect(await redisClient.lRange(key, 0, -1)).toEqual(["movie-2"]);
    await redisClient.del(key);
  });
});

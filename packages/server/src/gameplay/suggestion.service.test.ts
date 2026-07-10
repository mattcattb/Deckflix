import {afterEach, describe, expect, test} from "bun:test";
import {redisClient} from "../redis/redis";
import {roomPrefix} from "../rooms/room-keys";
import * as SuggestionService from "./suggestion.service";

const gameCode = "NOTE";

afterEach(async () => {
  const keys = await redisClient.keys(`${roomPrefix(gameCode)}*`);
  if (keys.length) await redisClient.del(keys);
});

describe("suggestion notifications", () => {
  test("stores a bounded private positive reaction", async () => {
    await SuggestionService.notifySuggestionLiked({
      gameCode,
      suggestedByPlayerId: "player-1",
      movieTitle: "Hot Pick",
    });

    const notifications = await SuggestionService.listPlayerNotifications(
      gameCode,
      "player-1",
    );
    expect(notifications.items).toHaveLength(1);
    expect(notifications.items[0]?.message).toContain("Hot Pick");
  });
});

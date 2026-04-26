import {describe, expect, test} from "bun:test";
import * as DeckService from "./deck.service";

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
});

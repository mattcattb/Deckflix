import {describe, expect, test} from "bun:test";
import * as compatibility from "../game-messages";
import {
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "./messages";

describe("shared event messages", () => {
  test("parses and encodes new domain events", () => {
    const displayRaw = encodeDisplayServerMessage({
      type: "room.status_changed",
      payload: {
        previousStatus: "lobby",
        nextStatus: "swiping",
      },
    });
    const playerRaw = encodePlayerServerMessage({
      type: "swipe.vote_recorded",
      payload: {
        movieId: "movie-1",
        choice: "like",
      },
    });

    expect(parseDisplayServerMessage(displayRaw)).toEqual({
      type: "room.status_changed",
      payload: {
        previousStatus: "lobby",
        nextStatus: "swiping",
      },
    });
    expect(parsePlayerServerMessage(playerRaw)).toEqual({
      type: "swipe.vote_recorded",
      payload: {
        movieId: "movie-1",
        choice: "like",
      },
    });
  });

  test("keeps the compatibility re-export working", () => {
    const raw = compatibility.encodeDisplayServerMessage({
      type: "room.deleted",
    });

    expect(compatibility.parseDisplayServerMessage(raw)).toEqual({
      type: "room.deleted",
    });
    expect(typeof compatibility.decodeDisplayClientMessage).toBe("function");
  });
});

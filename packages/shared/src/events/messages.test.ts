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
      gameCode: "ABCD",
      previousStatus: "lobby",
      nextStatus: "swiping",
    });
    const playerRaw = encodePlayerServerMessage({
      type: "room.started",
      gameCode: "ABCD",
    });

    expect(parseDisplayServerMessage(displayRaw)).toEqual({
      type: "room.status_changed",
      gameCode: "ABCD",
      previousStatus: "lobby",
      nextStatus: "swiping",
    });
    expect(parsePlayerServerMessage(playerRaw)).toEqual({
      type: "room.started",
      gameCode: "ABCD",
    });
  });

  test("keeps the compatibility re-export working", () => {
    const raw = compatibility.encodeDisplayServerMessage({
      type: "room.deleted",
      gameCode: "ABCD",
    });

    expect(compatibility.parseDisplayServerMessage(raw)).toEqual({
      type: "room.deleted",
      gameCode: "ABCD",
    });
    expect(typeof compatibility.decodeDisplayClientMessage).toBe("function");
  });
});

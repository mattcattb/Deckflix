import {describe, expect, test} from "bun:test";
import * as RealtimeService from "./realtime.service";

describe("realtime.service", () => {
  test("builds stable display and player topics", () => {
    expect(RealtimeService.getDisplayTopic(" abcd ")).toBe("ws:display:ABCD");
    expect(RealtimeService.getPlayerTopic(" abcd ", "player-1")).toBe(
      "ws:player:ABCD:player-1",
    );
  });
});

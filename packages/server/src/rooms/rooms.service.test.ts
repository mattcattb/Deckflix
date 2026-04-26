import {describe, expect, test} from "bun:test";
import * as RoomsService from "./rooms.service";

describe("rooms.service", () => {
  test("normalizes room-scoped keys", () => {
    expect(RoomsService.normalizeGameCode(" abcd ")).toBe("ABCD");
    expect(RoomsService.roomPrefix(" abcd ")).toBe("game:ABCD:");
    expect(RoomsService.roomKey(" abcd ")).toBe("game:ABCD:room");
  });
});

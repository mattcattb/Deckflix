import {describe, expect, mock, test} from "bun:test";

describe("presence.service", () => {
  test("tracks display presence in memory", async () => {
    mock.module(new URL("../rooms/rooms.service.ts", import.meta.url).href, () => ({
      verifyDisplaySession: mock(async () => ({meta: {}})),
    }));
    const PresenceService = await import("./presence.service");

    const socket = {
      send: mock(),
      close: mock(),
    };

    await PresenceService.connectDisplay({
      gameCode: "abcd",
      displayId: "display-1",
      sessionToken: "token-1",
      socket,
    });

    expect(PresenceService.isDisplayConnected("ABCD")).toBe(true);
    PresenceService.disconnectDisplay({gameCode: "abcd", socket});
    expect(PresenceService.isDisplayConnected("ABCD")).toBe(false);
  });
});

import {describe, expect, mock, test} from "bun:test";

describe("presence.service", () => {
  test("tracks display presence in memory", async () => {
    const PresenceService = await import("./presence.service");

    const socket = {
      send: mock(),
      close: mock(),
    };

    PresenceService.connectDisplay({
      gameCode: "abcd",
      socket,
    });

    expect(PresenceService.isDisplayConnected("ABCD")).toBe(true);
    PresenceService.disconnectDisplay({gameCode: "abcd", socket});
    expect(PresenceService.isDisplayConnected("ABCD")).toBe(false);
  });
});

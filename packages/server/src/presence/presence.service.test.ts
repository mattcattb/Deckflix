import {describe, expect, test} from "bun:test";

describe("presence.service", () => {
  test("tracks player presence in Redis", async () => {
    const PresenceService = await import("./presence.service");
    const gameCode = "PTST";
    const playerId = "player-1";

    await PresenceService.clearPresenceState(gameCode);
    await PresenceService.connectPlayer({
      gameCode,
      playerId,
    });

    expect(await PresenceService.isPlayerConnected(gameCode, playerId)).toBe(
      true,
    );
    expect(await PresenceService.listConnectedPlayerIds(gameCode)).toContain(
      playerId,
    );

    await PresenceService.disconnectPlayer({gameCode, playerId});
    expect(await PresenceService.isPlayerConnected(gameCode, playerId)).toBe(
      false,
    );
  });

  test("keeps a player connected until their final socket closes", async () => {
    const PresenceService = await import("./presence.service");
    const gameCode = "PMUL";
    const playerId = "player-1";

    await PresenceService.clearPresenceState(gameCode);
    await PresenceService.connectPlayer({gameCode, playerId});
    await PresenceService.connectPlayer({gameCode, playerId});

    await PresenceService.disconnectPlayer({gameCode, playerId});
    expect(await PresenceService.isPlayerConnected(gameCode, playerId)).toBe(
      true,
    );

    await PresenceService.disconnectPlayer({gameCode, playerId});
    expect(await PresenceService.isPlayerConnected(gameCode, playerId)).toBe(
      false,
    );
  });
});

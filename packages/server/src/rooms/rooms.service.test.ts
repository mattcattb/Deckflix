import {beforeEach, describe, expect, mock, test} from "bun:test";

const publishRoomState = mock();
const getGameMeta = mock();
const getGamePlayers = mock();
const getGameResults = mock();
const assertRoomSessionAvailable = mock();
const getActiveRoomClient = mock();
const getRoomClient = mock();
const generatePool = mock();
const savePool = mock();
const createPoolSeed = mock(() => "pool-seed-1");
const clearPresenceState = mock();
const deleteRoomKeys = mock();
const listPlayerIds = mock();
const withRoomLock = mock(async (_gameCode: string, callback: () => Promise<unknown>) =>
  callback(),
);
const setPlayerRecord = mock();
const resolveGameSettings = mock((value?: unknown) => value ?? defaultSettings);
const getGameSettingsOrThrow = mock(async () => defaultSettings);
const setGameSettings = mock();
const createGameMeta = mock(async () => true);
const getGameMetaOrThrow = mock(async () => ({
  id: "game-1",
  code: "ABCD",
  roomName: "Room",
  status: "lobby",
  createdAt: new Date().toISOString(),
  endedAt: null,
  display: {
    id: "display-1",
    sessionToken: "display-session",
  },
}));
const setGameMeta = mock();
const verifyDisplaySession = mock();
const verifyPlayerSession = mock();
const initializePlayerDecks = mock();
const clearPlayerDeck = mock();
const deletePlayerRecord = mock();
const publishPlayerLeft = mock();
const publishDisplayMessage = mock();
const publishPlayerMessage = mock();

const defaultSettings = {
  gameplay: {
    maxMovies: 100,
    allowMaybe: true,
    allowSuperLike: true,
  },
  movieFilters: {
    popularityPreset: "balanced",
    includedGenreIds: [],
    excludedGenreIds: [],
    primaryReleaseDateGte: null,
    primaryReleaseDateLte: null,
    voteAverageGte: null,
    voteAverageLte: null,
  },
};

mock.module(new URL("../games/game-state.pubsub.ts", import.meta.url).href, () => ({
  publishGameState: publishRoomState,
}));
mock.module(new URL("../games/game-snapshot.service.ts", import.meta.url).href, () => ({
  getGameMeta,
  getGamePlayers,
  getGameResults,
}));
mock.module(new URL("../pool/pool-generator.service.ts", import.meta.url).href, () => ({
  generatePool,
  createPoolSeed,
}));
mock.module(new URL("../pool/pool.service.ts", import.meta.url).href, () => ({
  savePool,
}));
mock.module(new URL("./room-lifecycle.service.ts", import.meta.url).href, () => ({
  normalizeGameCode: (gameCode: string) => gameCode.trim().toUpperCase(),
  deleteRoomKeys,
  withRoomLock,
}));
mock.module(new URL("./room-players.service.ts", import.meta.url).href, () => ({
  listPlayerIds,
  setPlayerRecord,
  deletePlayerRecord,
}));
mock.module(new URL("../settings/game-settings.service.ts", import.meta.url).href, () => ({
  resolveGameSettings,
  getGameSettingsOrThrow,
  setGameSettings,
}));
mock.module(new URL("./room-meta.service.ts", import.meta.url).href, () => ({
  createGameMeta,
  getGameMetaOrThrow,
  setGameMeta,
}));
mock.module(new URL("./room-session.service.ts", import.meta.url).href, () => ({
  assertRoomSessionAvailable,
  getActiveRoomClient,
  getRoomClient,
  verifyDisplaySession,
  verifyPlayerSession,
}));
mock.module(new URL("../swipe/deck.service.ts", import.meta.url).href, () => ({
  initializePlayerDecks,
  clearPlayerDeck,
}));
mock.module(new URL("../ws/presence.ws.ts", import.meta.url).href, () => ({
  clearPresenceState,
}));
mock.module(new URL("../ws/presence.pubsub.ts", import.meta.url).href, () => ({
  publishPlayerJoined: mock(),
  publishPlayerLeft,
}));
mock.module(new URL("./rooms.pubsub.ts", import.meta.url).href, () => ({
  publishRoomStarted: (server: unknown, gameCode: string) => {
    publishDisplayMessage(server, gameCode, {
      type: "room.started",
    });
  },
  publishRoomStatusChanged: (...args: unknown[]) => {
    const [server, gameCode, playerIds, previousStatus, nextStatus] = args as [
      unknown,
      string,
      string[],
      "lobby" | "swiping" | "completed",
      "lobby" | "swiping" | "completed",
    ];
    const event = {
      type: "room.status_changed" as const,
      payload: {
        previousStatus,
        nextStatus,
      },
    };
    publishDisplayMessage(server, gameCode, event);
    for (const playerId of playerIds) {
      publishPlayerMessage(server, gameCode, playerId, event);
    }
  },
  publishRoomDeleted: (...args: unknown[]) => {
    const [server, gameCode, playerIds] = args as [
      unknown,
      string,
      string[],
    ];
    publishDisplayMessage(server, gameCode, {
      type: "room.deleted",
    });
    for (const playerId of playerIds) {
      publishPlayerMessage(server, gameCode, playerId, {
        type: "room.deleted",
      });
    }
  },
}));
mock.module(new URL("../realtime/display-channel.ts", import.meta.url).href, () => ({
  publishDisplayMessage,
  subscribeDisplaySocket: mock(),
  unsubscribeDisplaySocket: mock(),
  getDisplayTopic: mock(),
}));
mock.module(new URL("../realtime/player-channel.ts", import.meta.url).href, () => ({
  publishPlayerMessage,
  subscribePlayerSocket: mock(),
  unsubscribePlayerSocket: mock(),
  getPlayerTopic: mock(),
}));

const RoomsService = await import(new URL("./rooms.service.ts", import.meta.url).href);

beforeEach(() => {
  publishRoomState.mockReset();
  getGameMeta.mockReset();
  getGamePlayers.mockReset();
  getGameResults.mockReset();
  assertRoomSessionAvailable.mockReset();
  getActiveRoomClient.mockReset();
  getRoomClient.mockReset();
  generatePool.mockReset();
  savePool.mockReset();
  createPoolSeed.mockReset();
  clearPresenceState.mockReset();
  deleteRoomKeys.mockReset();
  listPlayerIds.mockReset();
  withRoomLock.mockReset();
  setPlayerRecord.mockReset();
  resolveGameSettings.mockReset();
  getGameSettingsOrThrow.mockReset();
  setGameSettings.mockReset();
  createGameMeta.mockReset();
  getGameMetaOrThrow.mockReset();
  setGameMeta.mockReset();
  verifyDisplaySession.mockReset();
  verifyPlayerSession.mockReset();
  initializePlayerDecks.mockReset();
  clearPlayerDeck.mockReset();
  deletePlayerRecord.mockReset();
  publishPlayerLeft.mockReset();
  publishDisplayMessage.mockReset();
  publishPlayerMessage.mockReset();

  createPoolSeed.mockReturnValue("pool-seed-1");
  withRoomLock.mockImplementation(
    async (_gameCode: string, callback: () => Promise<unknown>) => callback(),
  );
  resolveGameSettings.mockImplementation((value?: unknown) => value ?? defaultSettings);
  getGameSettingsOrThrow.mockResolvedValue(defaultSettings);
  createGameMeta.mockResolvedValue(true);
  getGameMetaOrThrow.mockResolvedValue({
    id: "game-1",
    code: "ABCD",
    roomName: "Room",
    status: "lobby",
    createdAt: new Date().toISOString(),
    endedAt: null,
    display: {
      id: "display-1",
      sessionToken: "display-session",
    },
  });
});

describe("rooms.service", () => {
  test("create stores settings and pool seed in room metadata without building the full pool", async () => {
    const result = await RoomsService.create({
      roomName: "Room",
      settings: defaultSettings,
    });

    expect(createPoolSeed).toHaveBeenCalledTimes(1);
    expect(createGameMeta).toHaveBeenCalledWith(
      expect.objectContaining({poolSeed: "pool-seed-1"}),
    );
    expect(generatePool).not.toHaveBeenCalled();
    expect(savePool).not.toHaveBeenCalled();
    expect(setGameSettings).toHaveBeenCalledTimes(1);
    expect(result.gameCode).toBeTruthy();
  });

  test("start builds and saves the pool once before initializing player queues", async () => {
    listPlayerIds.mockResolvedValue(["player-1", "player-2"]);
    generatePool.mockResolvedValue([
      {
        id: "movie-a",
        title: "Movie A",
        year: 2020,
        overview: "A",
        posterUrl: "",
        rating: 7.4,
      },
    ]);

    await RoomsService.start({
      gameCode: "ABCD",
      server: {
        publish: mock(),
      },
    });

    expect(generatePool).toHaveBeenCalledWith({
      gameCode: "ABCD",
      settings: defaultSettings,
    });
    expect(savePool).toHaveBeenCalledTimes(1);
    expect(initializePlayerDecks).toHaveBeenCalledWith("ABCD", [
      "player-1",
      "player-2",
    ], 1);
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABCD", {
      type: "room.status_changed",
      payload: {
        previousStatus: "lobby",
        nextStatus: "swiping",
      },
    });
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABCD", {
      type: "room.started",
    });
  });

  test("end marks the room completed, notifies clients, and removes room state", async () => {
    listPlayerIds.mockResolvedValue(["player-1", "player-2"]);

    await RoomsService.end({
      gameCode: "ABCD",
      displayId: "display-1",
      sessionToken: "display-session",
      server: {
        publish: mock(),
      },
    });

    expect(verifyDisplaySession).toHaveBeenCalledWith({
      gameCode: "ABCD",
      displayId: "display-1",
      sessionToken: "display-session",
    });
    expect(setGameMeta).toHaveBeenCalledTimes(1);
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABCD", {
      type: "room.status_changed",
      payload: {
        previousStatus: "lobby",
        nextStatus: "completed",
      },
    });
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABCD", {
      type: "room.deleted",
    });
    expect(publishPlayerMessage).toHaveBeenCalledWith(
      expect.anything(),
      "ABCD",
      "player-1",
      {
        type: "room.status_changed",
        payload: {
          previousStatus: "lobby",
          nextStatus: "completed",
        },
      },
    );
    expect(publishPlayerMessage).toHaveBeenCalledWith(
      expect.anything(),
      "ABCD",
      "player-1",
      {
        type: "room.deleted",
      },
    );
    expect(deleteRoomKeys).toHaveBeenCalledWith("ABCD");
    expect(clearPresenceState).toHaveBeenCalledWith("ABCD");
  });

  test("leavePlayer verifies the player and removes player state idempotently", async () => {
    listPlayerIds.mockResolvedValue(["player-2"]);

    await RoomsService.leavePlayer({
      player: {
        gameCode: "ABCD",
        playerId: "player-1",
        sessionToken: "token-1",
      },
      server: {
        publish: mock(),
      },
    });

    expect(verifyPlayerSession).toHaveBeenCalledWith({
      gameCode: "ABCD",
      playerId: "player-1",
      sessionToken: "token-1",
    });
    expect(clearPlayerDeck).toHaveBeenCalledWith("ABCD", "player-1");
    expect(deletePlayerRecord).toHaveBeenCalledWith("ABCD", "player-1");
    expect(publishPlayerLeft).toHaveBeenCalledWith(
      expect.anything(),
      "ABCD",
      "player-1",
    );
    expect(publishRoomState).toHaveBeenCalledWith(
      expect.anything(),
      "ABCD",
      ["player-2"],
    );
  });
});

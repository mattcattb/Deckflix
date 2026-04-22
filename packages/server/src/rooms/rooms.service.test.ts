import {beforeEach, describe, expect, mock, test} from "bun:test";

const publishRoomState = mock();
const getGameMeta = mock();
const getGamePlayers = mock();
const getGameResults = mock();
const assertRoomSessionAvailable = mock();
const getActiveRoomClient = mock();
const getRoomClient = mock();
const buildInitialPool = mock();
const saveInitialPool = mock();
const createPoolSeed = mock(() => "pool-seed-1");
const setPoolSeed = mock();
const clearPresenceState = mock();
const touchRoomKeys = mock();
const deleteRoomKeys = mock();
const listPlayerIds = mock();
const withGameLock = mock(async (_gameCode: string, callback: () => Promise<unknown>) =>
  callback(),
);
const resolveGameSettings = mock((value?: unknown) => value ?? defaultSettings);
const getGameSettingsOrThrow = mock(async () => defaultSettings);
const setGameSettings = mock();
const createGameMeta = mock(async () => true);
const getGameMetaOrThrow = mock(async () => ({
  id: "game-1",
  code: "ABC123",
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
const clearPlayerState = mock();
const refillPlayerQueue = mock();
const getCurrentOrNextMovie = mock();
const publishDisplayMessage = mock();
const publishPlayerMessage = mock();

const defaultSettings = {
  gameplay: {
    maxMovies: 100,
    allowMaybe: true,
    allowSuperLike: true,
  },
  movieFilters: {
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
mock.module(new URL("../games/game-pool.ts", import.meta.url).href, () => ({
  buildInitialPool,
  saveInitialPool,
  createPoolSeed,
  setPoolSeed,
}));
mock.module(new URL("../games/game-redis.service.ts", import.meta.url).href, () => ({
  normalizeGameCode: (gameCode: string) => gameCode.trim().toUpperCase(),
  touchRoomKeys,
  deleteRoomKeys,
  listPlayerIds,
  withGameLock,
  setPlayerRecord: mock(),
  setMovieRecord: mock(),
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
}));
mock.module(new URL("../swipe/swipe.service.ts", import.meta.url).href, () => ({
  clearPlayerState,
  refillPlayerQueue,
  getCurrentOrNextMovie,
}));
mock.module(new URL("../ws/presence.ws.ts", import.meta.url).href, () => ({
  clearPresenceState,
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
  buildInitialPool.mockReset();
  saveInitialPool.mockReset();
  createPoolSeed.mockReset();
  setPoolSeed.mockReset();
  clearPresenceState.mockReset();
  touchRoomKeys.mockReset();
  deleteRoomKeys.mockReset();
  listPlayerIds.mockReset();
  withGameLock.mockReset();
  resolveGameSettings.mockReset();
  getGameSettingsOrThrow.mockReset();
  setGameSettings.mockReset();
  createGameMeta.mockReset();
  getGameMetaOrThrow.mockReset();
  setGameMeta.mockReset();
  verifyDisplaySession.mockReset();
  clearPlayerState.mockReset();
  refillPlayerQueue.mockReset();
  getCurrentOrNextMovie.mockReset();
  publishDisplayMessage.mockReset();
  publishPlayerMessage.mockReset();

  createPoolSeed.mockReturnValue("pool-seed-1");
  withGameLock.mockImplementation(
    async (_gameCode: string, callback: () => Promise<unknown>) => callback(),
  );
  resolveGameSettings.mockImplementation((value?: unknown) => value ?? defaultSettings);
  getGameSettingsOrThrow.mockResolvedValue(defaultSettings);
  createGameMeta.mockResolvedValue(true);
  getGameMetaOrThrow.mockResolvedValue({
    id: "game-1",
    code: "ABC123",
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
  test("create stores settings and pool seed without building the full pool", async () => {
    const result = await RoomsService.create({
      roomName: "Room",
      settings: defaultSettings,
    });

    expect(createPoolSeed).toHaveBeenCalledTimes(1);
    expect(setPoolSeed).toHaveBeenCalledTimes(1);
    expect(buildInitialPool).not.toHaveBeenCalled();
    expect(saveInitialPool).not.toHaveBeenCalled();
    expect(setGameSettings).toHaveBeenCalledTimes(1);
    expect(result.gameCode).toBeTruthy();
  });

  test("start builds and saves the pool once before initializing player queues", async () => {
    listPlayerIds.mockResolvedValue(["player-1", "player-2"]);
    buildInitialPool.mockResolvedValue([
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
      gameCode: "ABC123",
      server: {
        publish: mock(),
      },
    });

    expect(buildInitialPool).toHaveBeenCalledWith({
      gameCode: "ABC123",
      settings: defaultSettings,
    });
    expect(saveInitialPool).toHaveBeenCalledTimes(1);
    expect(clearPlayerState).toHaveBeenCalledTimes(2);
    expect(refillPlayerQueue).toHaveBeenCalledTimes(2);
    expect(getCurrentOrNextMovie).toHaveBeenCalledTimes(2);
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABC123", {
      type: "room.status_changed",
      payload: {
        previousStatus: "lobby",
        nextStatus: "swiping",
      },
    });
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABC123", {
      type: "room.started",
    });
  });

  test("end marks the room completed, notifies clients, and removes room state", async () => {
    listPlayerIds.mockResolvedValue(["player-1", "player-2"]);

    await RoomsService.end({
      gameCode: "ABC123",
      displayId: "display-1",
      sessionToken: "display-session",
      server: {
        publish: mock(),
      },
    });

    expect(verifyDisplaySession).toHaveBeenCalledWith({
      gameCode: "ABC123",
      displayId: "display-1",
      sessionToken: "display-session",
    });
    expect(setGameMeta).toHaveBeenCalledTimes(1);
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABC123", {
      type: "room.status_changed",
      payload: {
        previousStatus: "lobby",
        nextStatus: "completed",
      },
    });
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABC123", {
      type: "room.deleted",
    });
    expect(publishPlayerMessage).toHaveBeenCalledWith(
      expect.anything(),
      "ABC123",
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
      "ABC123",
      "player-1",
      {
        type: "room.deleted",
      },
    );
    expect(deleteRoomKeys).toHaveBeenCalledWith("ABC123");
    expect(clearPresenceState).toHaveBeenCalledWith("ABC123");
  });
});

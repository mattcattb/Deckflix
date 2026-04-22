import {beforeEach, describe, expect, mock, test} from "bun:test";

const maybeRefillPool = mock();
const getPoolEntries = mock();
const getPoolSeedOrThrow = mock();
const getMovieRecordOrThrow = mock();
const setMovieRecord = mock();
const listPlayerIds = mock();
const getPlayerSeenMovieIds = mock();
const getPlayerQueueEntries = mock();
const getPlayerCurrentAssignment = mock();
const getPlayerQueueLength = mock();
const pushPlayerQueueEntries = mock();
const clearPlayerQueue = mock();
const hasPlayerSeenMovie = mock();
const popPlayerQueueEntry = mock();
const setPlayerCurrentAssignment = mock();
const markPlayerSeenMovie = mock();
const clearPlayerCurrentAssignment = mock();
const ensureRedis = mock();
const publishSocketTopic = mock();
const redis = {};
const getGameSettingsOrThrow = mock();
const getMatchedMovieIds = mock();
const getRejectedMovieIds = mock();
const getPlayerVote = mock();
const setPlayerVote = mock();
const syncMovieOutcomeSets = mock();
const getGameMetaOrThrow = mock();
const setGameMeta = mock();
const getPlayerRecord = mock();
const verifyPlayerSession = mock();
const publishRoomState = mock();
const publishDisplayMessage = mock();
const publishPlayerMessage = mock();

mock.module(new URL("../games/game-pool.service.ts", import.meta.url).href, () => ({
  maybeRefillPool,
  getPoolEntries,
  getPoolSeedOrThrow,
}));
mock.module(new URL("../games/game-redis.service.ts", import.meta.url).href, () => ({
  getMovieRecordOrThrow,
  getMovieRecords: mock(),
  listPlayerIds,
  getPlayerRecord,
  setMovieRecord,
  touchRoomKeys: mock(),
  withGameLock: mock(),
}));
mock.module(new URL("./swipe-queue.service.ts", import.meta.url).href, () => ({
  getPlayerSeenMovieIds,
  getPlayerQueueEntries,
  getPlayerCurrentAssignment,
  getPlayerQueueLength,
  pushPlayerQueueEntries,
  popPlayerQueueEntry,
  setPlayerCurrentAssignment,
  deleteSwipeState: mock(),
  getPlayerSeenCount: mock(),
  hasPlayerSeenMovie,
  markPlayerSeenMovie,
  clearPlayerCurrentAssignment,
  clearPlayerQueue,
}));
mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  publishSocketTopic,
  redis,
}));
mock.module(new URL("../settings/game-settings.service.ts", import.meta.url).href, () => ({
  getGameSettingsOrThrow,
}));
mock.module(new URL("./swipe-ledger.service.ts", import.meta.url).href, () => ({
  getMatchedMovieIds,
  getRejectedMovieIds,
  getPlayerVote,
  setPlayerVote,
  syncMovieOutcomeSets,
}));
mock.module(new URL("../rooms/room-meta.service.ts", import.meta.url).href, () => ({
  getGameMetaOrThrow,
  setGameMeta,
}));
mock.module(new URL("../rooms/room-session.service.ts", import.meta.url).href, () => ({
  verifyPlayerSession,
}));
mock.module(new URL("../games/game-state.pubsub.ts", import.meta.url).href, () => ({
  publishGameState: publishRoomState,
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

const SwipeService = await import(new URL("./swipe.service.ts", import.meta.url).href);

const poolEntries = Array.from({length: 8}, (_, order) => ({
  movieId: `movie-${order + 1}`,
  order,
}));

beforeEach(() => {
  maybeRefillPool.mockReset();
  getPoolEntries.mockReset();
  getPoolSeedOrThrow.mockReset();
  getMovieRecordOrThrow.mockReset();
  setMovieRecord.mockReset();
  listPlayerIds.mockReset();
  getPlayerSeenMovieIds.mockReset();
  getPlayerQueueEntries.mockReset();
  getPlayerCurrentAssignment.mockReset();
  getPlayerQueueLength.mockReset();
  pushPlayerQueueEntries.mockReset();
  clearPlayerQueue.mockReset();
  hasPlayerSeenMovie.mockReset();
  popPlayerQueueEntry.mockReset();
  setPlayerCurrentAssignment.mockReset();
  markPlayerSeenMovie.mockReset();
  clearPlayerCurrentAssignment.mockReset();
  ensureRedis.mockReset();
  publishSocketTopic.mockReset();
  getGameSettingsOrThrow.mockReset();
  getMatchedMovieIds.mockReset();
  getRejectedMovieIds.mockReset();
  getPlayerVote.mockReset();
  setPlayerVote.mockReset();
  syncMovieOutcomeSets.mockReset();
  getGameMetaOrThrow.mockReset();
  setGameMeta.mockReset();
  getPlayerRecord.mockReset();
  verifyPlayerSession.mockReset();
  publishRoomState.mockReset();
  publishDisplayMessage.mockReset();
  publishPlayerMessage.mockReset();

  getPoolSeedOrThrow.mockResolvedValue("pool-seed-1");
  getPoolEntries.mockResolvedValue(poolEntries);
  getPlayerSeenMovieIds.mockResolvedValue([]);
  getPlayerQueueEntries.mockResolvedValue([]);
  getPlayerCurrentAssignment.mockResolvedValue(null);
  getPlayerQueueLength.mockResolvedValue(0);
  hasPlayerSeenMovie.mockResolvedValue(false);
  popPlayerQueueEntry.mockResolvedValue(null);
  getMovieRecordOrThrow.mockImplementation(
    async (_gameCode: string, movieId: string) => ({
      movie: {
        id: movieId,
        title: movieId,
        year: 2024,
        overview: movieId,
        posterUrl: "",
        rating: 7,
      },
      status: "pending",
      likeCount: 0,
      dislikeCount: 0,
      maybeCount: 0,
      superLikeCount: 0,
      skipCount: 0,
      totalVotes: 0,
      resolvedAt: null,
      lastActivityAt: null,
      matchedAt: null,
    }),
  );
});

describe("swipe.service", () => {
  test("refillPlayerQueue randomizes deterministically per player within the top queue window", async () => {
    await SwipeService.refillPlayerQueue("ABC123", "player-1", 4);
    const firstPlayerInitialOrder = pushPlayerQueueEntries.mock.calls[0][2].map(
      (entry: {movieId: string}) => entry.movieId,
    );

    pushPlayerQueueEntries.mockReset();

    await SwipeService.refillPlayerQueue("ABC123", "player-1", 4);
    const firstPlayerRepeatOrder = pushPlayerQueueEntries.mock.calls[0][2].map(
      (entry: {movieId: string}) => entry.movieId,
    );

    pushPlayerQueueEntries.mockReset();

    await SwipeService.refillPlayerQueue("ABC123", "player-2", 4);
    const secondPlayerOrder = pushPlayerQueueEntries.mock.calls[0][2].map(
      (entry: {movieId: string}) => entry.movieId,
    );

    expect(firstPlayerInitialOrder).toEqual(firstPlayerRepeatOrder);
    expect(secondPlayerOrder).not.toEqual(firstPlayerInitialOrder);
    expect(firstPlayerInitialOrder).toHaveLength(4);
    expect(firstPlayerInitialOrder.every((movieId: string) => {
      const order = poolEntries.find((entry) => entry.movieId === movieId)?.order ?? 999;
      return order < 6;
    })).toBe(true);
  });

  test("refreshMovieOutcome marks a movie matched only when every player voted positively", async () => {
    listPlayerIds.mockResolvedValue(["player-1", "player-2", "player-3"]);
    getMovieRecordOrThrow.mockResolvedValue({
      movie: {
        id: "movie-1",
        title: "movie-1",
        year: 2024,
        overview: "movie-1",
        posterUrl: "",
        rating: 7,
      },
      status: "pending",
      likeCount: 2,
      dislikeCount: 0,
      maybeCount: 0,
      superLikeCount: 1,
      skipCount: 0,
      totalVotes: 3,
      resolvedAt: null,
      lastActivityAt: "2026-04-22T12:00:00.000Z",
      matchedAt: null,
    });

    const result = await SwipeService.refreshMovieOutcome("ABC123", "movie-1");

    expect(result).toEqual({
      justMatched: true,
      status: "matched",
    });
    expect(setMovieRecord).toHaveBeenCalledWith(
      "ABC123",
      "movie-1",
      expect.objectContaining({
        status: "matched",
        matchedAt: expect.any(String),
      }),
    );
  });

  test("refreshMovieOutcome rejects a movie once all players have seen it without unanimous likes", async () => {
    listPlayerIds.mockResolvedValue(["player-1", "player-2", "player-3"]);
    hasPlayerSeenMovie.mockResolvedValue(true);
    getMovieRecordOrThrow.mockResolvedValue({
      movie: {
        id: "movie-2",
        title: "movie-2",
        year: 2024,
        overview: "movie-2",
        posterUrl: "",
        rating: 7,
      },
      status: "pending",
      likeCount: 2,
      dislikeCount: 0,
      maybeCount: 1,
      superLikeCount: 0,
      skipCount: 0,
      totalVotes: 3,
      resolvedAt: null,
      lastActivityAt: "2026-04-22T12:00:00.000Z",
      matchedAt: null,
    });

    const result = await SwipeService.refreshMovieOutcome("ABC123", "movie-2");

    expect(result).toEqual({
      justMatched: false,
      status: "rejected",
    });
    expect(setMovieRecord).toHaveBeenCalledWith(
      "ABC123",
      "movie-2",
      expect.objectContaining({
        status: "rejected",
      }),
    );
  });

  test("getCurrentOrNextMovie heals a stale current assignment that already has a vote", async () => {
    getPlayerCurrentAssignment.mockResolvedValue({
      assignmentId: "assignment-1",
      movieId: "movie-1",
      order: 0,
      issuedAt: "2026-04-22T12:00:00.000Z",
    });
    getPlayerQueueEntries.mockResolvedValue([{movieId: "movie-2", order: 1}]);
    getPlayerVote.mockImplementation(
      async (_gameCode: string, movieId: string, playerId: string) =>
        movieId === "movie-1" && playerId === "player-1" ? "like" : null,
    );
    popPlayerQueueEntry.mockResolvedValue({movieId: "movie-2", order: 1});

    const result = await SwipeService.getCurrentOrNextMovie("ABC123", "player-1");

    expect(markPlayerSeenMovie).toHaveBeenCalledWith(
      "ABC123",
      "player-1",
      "movie-1",
    );
    expect(clearPlayerCurrentAssignment).toHaveBeenCalledWith(
      "ABC123",
      "player-1",
    );
    expect(setPlayerCurrentAssignment).toHaveBeenCalledWith(
      "ABC123",
      "player-1",
      expect.objectContaining({
        movieId: "movie-2",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        movie: expect.objectContaining({
          id: "movie-2",
        }),
      }),
    );
  });
});

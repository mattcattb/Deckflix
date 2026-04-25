import {beforeEach, describe, expect, mock, test} from "bun:test";

const verifyPlayerSession = mock();
const popCurrentMovieId = mock();
const recordVote = mock();
const getProjectedPlayerState = mock();
const publishVoteRecorded = mock();
const publishMatchFound = mock();
const listPlayerIds = mock();
const publishGameState = mock();

mock.module(new URL("../rooms/room-session.service.ts", import.meta.url).href, () => ({
  verifyPlayerSession,
}));
mock.module(new URL("./deck.service.ts", import.meta.url).href, () => ({
  popCurrentMovieId,
}));
mock.module(new URL("./vote.service.ts", import.meta.url).href, () => ({
  recordVote,
}));
mock.module(new URL("../pool/pool.service.ts", import.meta.url).href, () => ({
  getMovieMetaOrThrow: mock(),
}));
mock.module(new URL("../games/game-state.pubsub.ts", import.meta.url).href, () => ({
  getProjectedPlayerState,
  publishGameState,
}));
mock.module(new URL("./swipe.pubsub.ts", import.meta.url).href, () => ({
  publishVoteRecorded,
  publishMatchFound,
}));
mock.module(new URL("../rooms/room-players.service.ts", import.meta.url).href, () => ({
  listPlayerIds,
}));

const SwipeService = await import(new URL("./swipe.service.ts", import.meta.url).href);

beforeEach(() => {
  verifyPlayerSession.mockReset();
  popCurrentMovieId.mockReset();
  recordVote.mockReset();
  getProjectedPlayerState.mockReset();
  publishVoteRecorded.mockReset();
  publishMatchFound.mockReset();
  listPlayerIds.mockReset();
  publishGameState.mockReset();

  popCurrentMovieId.mockResolvedValue({status: "popped", movieId: "movie-1"});
  recordVote.mockResolvedValue({justMatched: false});
  getProjectedPlayerState.mockResolvedValue({currentItem: null});
  listPlayerIds.mockResolvedValue(["player-1", "player-2"]);
});

describe("swipe.service", () => {
  test("recordSwipe pops the expected deck head and records a vote", async () => {
    const result = await SwipeService.recordSwipe({
      player: {
        gameCode: "ABCD",
        playerId: "player-1",
        sessionToken: "token-1",
      },
      movieId: "movie-1",
      choice: "like",
      server: {publish: mock()} as any,
    });

    expect(verifyPlayerSession).toHaveBeenCalledWith({
      gameCode: "ABCD",
      playerId: "player-1",
      sessionToken: "token-1",
    });
    expect(popCurrentMovieId).toHaveBeenCalledWith("ABCD", "player-1", "movie-1");
    expect(recordVote).toHaveBeenCalledWith({
      gameCode: "ABCD",
      movieId: "movie-1",
      playerId: "player-1",
      choice: "like",
    });
    expect(publishVoteRecorded).toHaveBeenCalledWith(
      expect.objectContaining({
        gameCode: "ABCD",
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
      }),
    );
    expect(result.state).toEqual({currentItem: null});
  });

  test("recordSwipe rejects stale client movie ids without voting", async () => {
    popCurrentMovieId.mockResolvedValue({
      status: "mismatch",
      actualMovieId: "movie-2",
    });

    await expect(
      SwipeService.recordSwipe({
        player: {
          gameCode: "ABCD",
          playerId: "player-1",
          sessionToken: "token-1",
        },
        movieId: "movie-1",
        choice: "like",
        server: {publish: mock()} as any,
      }),
    ).rejects.toThrow("Vote does not match the deck head");

    expect(recordVote).not.toHaveBeenCalled();
  });

  test("recordSwipe publishes match events from vote results", async () => {
    recordVote.mockResolvedValue({justMatched: true});

    await SwipeService.recordSwipe({
      player: {
        gameCode: "ABCD",
        playerId: "player-1",
        sessionToken: "token-1",
      },
      movieId: "movie-1",
      choice: "super_like",
      server: {publish: mock()} as any,
    });

    expect(publishMatchFound).toHaveBeenCalledWith(
      expect.anything(),
      "ABCD",
      "movie-1",
    );
  });
});

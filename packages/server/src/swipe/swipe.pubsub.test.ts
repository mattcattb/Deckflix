import {beforeEach, describe, expect, mock, test} from "bun:test";

const publishDisplayMessage = mock();
const publishPlayerMessage = mock();

mock.module(new URL("../realtime/display-channel.ts", import.meta.url).href, () => ({
  publishDisplayMessage,
}));
mock.module(new URL("../realtime/player-channel.ts", import.meta.url).href, () => ({
  publishPlayerMessage,
}));

const SwipePubSub = await import(new URL("./swipe.pubsub.ts", import.meta.url).href);

beforeEach(() => {
  publishDisplayMessage.mockReset();
  publishPlayerMessage.mockReset();
});

describe("swipe.pubsub", () => {
  test("publishes domain-named swipe events", () => {
    SwipePubSub.publishVoteRecorded({
      server: {publish: mock()},
      gameCode: "ABC123",
      playerId: "player-1",
      movieId: "movie-1",
      choice: "like",
    });
    SwipePubSub.publishMatchFound({publish: mock()}, "ABC123", "movie-1");
    SwipePubSub.publishPlayerMatch({publish: mock()}, "ABC123", "player-1", "movie-1");

    expect(publishPlayerMessage).toHaveBeenCalledWith(
      expect.anything(),
      "ABC123",
      "player-1",
      {
        type: "swipe.vote_recorded",
        payload: {
          movieId: "movie-1",
          choice: "like",
        },
      },
    );
    expect(publishDisplayMessage).toHaveBeenCalledWith(expect.anything(), "ABC123", {
      type: "swipe.match_found",
      payload: {movieId: "movie-1"},
    });
    expect(publishPlayerMessage).toHaveBeenCalledWith(
      expect.anything(),
      "ABC123",
      "player-1",
      {
        type: "swipe.match_found",
        payload: {movieId: "movie-1"},
      },
    );
  });
});

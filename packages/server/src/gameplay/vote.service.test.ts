import {beforeEach, describe, expect, mock, test} from "bun:test";
import * as VoteService from "./vote.service";

const publish = mock();

beforeEach(() => {
  publish.mockReset();
});

describe("vote.service", () => {
  test("publishes vote and match events without changing payloads", () => {
    const server = {publish};

    VoteService.publishVoteRecorded({
      server,
      gameCode: "ABCD",
      playerId: "player-1",
      movieId: "movie-1",
      choice: "like",
    });
    VoteService.publishMatchFound(server, "ABCD", "movie-1");

    expect(publish).toHaveBeenCalledWith(
      "ws:display:ABCD",
      JSON.stringify({
        type: "swipe.vote_recorded",
        payload: {
          playerId: "player-1",
          movieId: "movie-1",
          choice: "like",
        },
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "ws:player:ABCD:player-1",
      JSON.stringify({
        type: "swipe.vote_recorded",
        payload: {
          playerId: "player-1",
          movieId: "movie-1",
          choice: "like",
        },
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "ws:display:ABCD",
      JSON.stringify({
        type: "swipe.match_found",
        payload: {
          movieId: "movie-1",
        },
      }),
    );
  });
});

import {beforeEach, describe, expect, mock, test} from "bun:test";
import {emitEvent} from "../common/app-events";
import {ensureRealtimeDomainEventListener} from "../realtime/domain-event-listener";

const publish = mock();
const server = {publish};

beforeEach(() => {
  publish.mockReset();
  ensureRealtimeDomainEventListener(server);
});

describe("vote.service", () => {
  test("publishes vote and match app events to websocket topics", () => {
    emitEvent("game.vote_recorded", {
      gameCode: "ABCD",
      playerId: "player-1",
      movieId: "movie-1",
      choice: "like",
      votedAt: "2026-05-12T00:00:00.000Z",
    });
    emitEvent("game.match_found", {
      gameCode: "ABCD",
      movieId: "movie-1",
    });

    expect(publish).toHaveBeenCalledWith(
      "ws:display:ABCD",
      JSON.stringify({
        type: "game.vote_recorded",
        gameCode: "ABCD",
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
        votedAt: "2026-05-12T00:00:00.000Z",
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "ws:player:ABCD:player-1",
      JSON.stringify({
        type: "game.vote_recorded",
        gameCode: "ABCD",
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
        votedAt: "2026-05-12T00:00:00.000Z",
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "ws:display:ABCD",
      JSON.stringify({
        type: "game.match_found",
        gameCode: "ABCD",
        movieId: "movie-1",
      }),
    );
  });
});

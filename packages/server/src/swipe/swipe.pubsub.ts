import type {SwipeChoice} from "@deckflix/shared";
import {publishDisplayMessage} from "../realtime/display-channel";
import {publishPlayerMessage} from "../realtime/player-channel";
import type {RealtimeServer} from "../realtime/socket-bus";

export const publishVoteRecorded = (input: {
  server: RealtimeServer;
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  publishDisplayMessage(input.server, input.gameCode, {
    type: "swipe.vote_recorded",
    payload: {
      playerId: input.playerId,
      movieId: input.movieId,
      choice: input.choice,
    },
  });

  publishPlayerMessage(input.server, input.gameCode, input.playerId, {
    type: "swipe.vote_recorded",
    payload: {
      playerId: input.playerId,
      movieId: input.movieId,
      choice: input.choice,
    },
  });
};

export const publishMatchFound = (
  server: RealtimeServer,
  gameCode: string,
  movieId: string,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "swipe.match_found",
    payload: {movieId},
  });
};

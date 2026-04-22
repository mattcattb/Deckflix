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
  publishPlayerMessage(input.server, input.gameCode, input.playerId, {
    type: "swipe.vote_recorded",
    payload: {
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

export const publishPlayerMatch = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  publishPlayerMessage(server, gameCode, playerId, {
    type: "swipe.match_found",
    payload: {movieId},
  });
};

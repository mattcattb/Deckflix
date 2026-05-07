import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import type {RealtimeServer} from "../realtime/realtime.service";
import {getProjectedPlayerState} from "../rooms/game-state.service";
import * as DeckService from "./deck.service";
import * as VoteService from "./vote.service";

export const recordSwipe = async (input: {
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
  server: RealtimeServer;
}) => {
  const popped = await DeckService.popCurrentMovieId(
    input.gameCode,
    input.playerId,
    input.movieId,
  );
  if (popped.status === "empty") {
    throw new BadRequestException("No active movie");
  }
  if (popped.status === "mismatch") {
    throw new BadRequestException("Vote does not match the deck head");
  }

  const vote = await VoteService.recordVote({
    gameCode: input.gameCode,
    movieId: popped.movieId,
    playerId: input.playerId,
    choice: input.choice,
  });

  VoteService.publishVoteRecorded({
    server: input.server,
    gameCode: input.gameCode,
    playerId: input.playerId,
    movieId: popped.movieId,
    choice: input.choice,
  });

  if (vote.justMatched) {
    VoteService.publishMatchFound(
      input.server,
      input.gameCode,
      popped.movieId,
    );
  }

  return {
    movieId: popped.movieId,
    choice: input.choice,
    state: await getProjectedPlayerState({
      gameCode: input.gameCode,
      playerId: input.playerId,
    }),
  };
};

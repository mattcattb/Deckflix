import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import {emitEvent} from "../common/app-events";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import {requestPoolExpansion} from "../pool/pool-events";
import * as DeckService from "./deck.service";
import * as VoteService from "./vote.service";

export const recordSwipe = async (input: {
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
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

  emitEvent("game.vote_recorded", {
    gameCode: input.gameCode,
    playerId: input.playerId,
    movieId: popped.movieId,
    choice: input.choice,
    votedAt: vote.votedAt,
  });

  const statePatch = await getPlayerSwipeStatePatch(input.gameCode, input.playerId);
  requestPoolExpansion({
    gameCode: input.gameCode,
    reason: "swipe_recorded",
  });

  return {
    movieId: popped.movieId,
    choice: input.choice,
    statePatch,
  };
};

const getPlayerSwipeStatePatch = async (gameCode: string, playerId: string) => {
  const currentMovieId = await DeckService.peekOrTopUpCurrentMovieId(
    gameCode,
    playerId,
  );
  const deckStatus = await DeckService.getPlayerDeckStatus(gameCode, playerId);

  return {
    me: {
      currentIndex: deckStatus.currentIndex,
      completed: deckStatus.completed,
    },
    currentItem: currentMovieId
      ? {
          movie: await MovieMetadataService.getRoomMovieMetadataOrThrow(
            gameCode,
            currentMovieId,
          ),
        }
      : null,
    remainingCount: deckStatus.remainingCount,
  };
};

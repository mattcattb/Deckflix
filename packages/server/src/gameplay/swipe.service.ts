import type {PlayerSession, SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import type {RealtimeServer} from "../realtime/realtime.service";
import * as RoomsService from "../rooms/rooms.service";
import * as DeckService from "./deck.service";
import * as VoteService from "./vote.service";

export const getSwipeState = async (player: {
  gameCode: string;
  playerId: string;
}) => {
  const GameStateService = await import("../state/game-state.service");
  return GameStateService.getProjectedPlayerState(player);
};

export const publishStateForGame = async (
  server: RealtimeServer,
  gameCode: string,
) => {
  const playerIds = await RoomsService.listPlayerIds(gameCode);
  const GameStateService = await import("../state/game-state.service");
  await GameStateService.publishGameState(server, gameCode, playerIds);
};

export const recordSwipe = async (input: {
  player: PlayerSession;
  movieId: string;
  choice: SwipeChoice;
  server: RealtimeServer;
}) => {
  await RoomsService.verifyPlayerSession(input.player);

  const popped = await DeckService.popCurrentMovieId(
    input.player.gameCode,
    input.player.playerId,
    input.movieId,
  );
  if (popped.status === "empty") {
    throw new BadRequestException("No active movie");
  }
  if (popped.status === "mismatch") {
    throw new BadRequestException("Vote does not match the deck head");
  }

  const vote = await VoteService.recordVote({
    gameCode: input.player.gameCode,
    movieId: popped.movieId,
    playerId: input.player.playerId,
    choice: input.choice,
  });

  VoteService.publishVoteRecorded({
    server: input.server,
    gameCode: input.player.gameCode,
    playerId: input.player.playerId,
    movieId: popped.movieId,
    choice: input.choice,
  });

  if (vote.justMatched) {
    VoteService.publishMatchFound(input.server, input.player.gameCode, popped.movieId);
  }

  return {
    movieId: popped.movieId,
    choice: input.choice,
    state: await getSwipeState({
      gameCode: input.player.gameCode,
      playerId: input.player.playerId,
    }),
  };
};

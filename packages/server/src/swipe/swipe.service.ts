import type {PlayerSession, SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import {
  getProjectedPlayerState,
  publishGameState,
} from "../games/game-state.pubsub";
import type {RealtimeServer} from "../realtime/socket-bus";
import * as RoomPlayersService from "../rooms/room-players.service";
import * as RoomSessionService from "../rooms/room-session.service";
import * as DeckService from "./deck.service";
import {publishMatchFound, publishVoteRecorded} from "./swipe.pubsub";
import * as VoteService from "./vote.service";

export const getSwipeState = async (player: {
  gameCode: string;
  playerId: string;
}) => getProjectedPlayerState(player);

export const publishStateForGame = async (
  server: RealtimeServer,
  gameCode: string,
) => {
  const playerIds = await RoomPlayersService.listPlayerIds(gameCode);
  await publishGameState(server, gameCode, playerIds);
};

export const recordSwipe = async (input: {
  player: PlayerSession;
  movieId: string;
  choice: SwipeChoice;
  server: RealtimeServer;
}) => {
  await RoomSessionService.verifyPlayerSession(input.player);

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

  publishVoteRecorded({
    server: input.server,
    gameCode: input.player.gameCode,
    playerId: input.player.playerId,
    movieId: popped.movieId,
    choice: input.choice,
  });

  if (vote.justMatched) {
    publishMatchFound(input.server, input.player.gameCode, popped.movieId);
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

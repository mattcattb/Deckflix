import type {PlayerSession, SwipeChoice} from "@deckflix/shared";
import * as GamePresenceService from "../ws/presence.ws";
import * as GameSnapshotService from "../games/game-snapshot.service";
import * as GameStateService from "../games/game-state.service";
import {publishDisplayMessage, publishPlayerMessage} from "../ws/topics";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getSwipeState = (player: {gameCode: string; playerId: string}) =>
  GameSnapshotService.getPlayerGameState(player);

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await GameStateService.getGamePlayerIds(gameCode);
  GamePresenceService.publishRoomState(server, gameCode, playerIds);
};

export const publishState = publishStateForGame;

const publishVoteRecorded = (input: {
  server: RealtimeServer;
  gameCode: string;
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  publishPlayerMessage(input.server as never, input.gameCode, input.playerId, {
    type: "player.vote_recorded",
    payload: {
      movieId: input.movieId,
      choice: input.choice,
    },
  });
};

const publishMatchFound = (
  server: RealtimeServer,
  gameCode: string,
  movieId: string,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.match_found",
    payload: {movieId},
  });
};

const publishPlayerMatch = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  publishPlayerMessage(server as never, gameCode, playerId, {
    type: "player.match_found",
    payload: {movieId},
  });
};

const publishPlayerLeft = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.player_left",
    payload: {playerId},
  });
};

export const recordSwipe = async (input: {
  player: PlayerSession;
  assignmentId: string;
  movieId: string;
  choice: SwipeChoice;
  server: RealtimeServer;
}) => {
  const result = await GameStateService.recordVote({
    player: input.player,
    assignmentId: input.assignmentId,
    movieId: input.movieId,
    choice: input.choice,
  });

  publishVoteRecorded({
    server: input.server,
    gameCode: input.player.gameCode,
    playerId: result.state.me.playerId,
    movieId: result.movieId,
    choice: result.choice,
  });

  if (result.justMatched) {
    publishMatchFound(input.server, input.player.gameCode, result.movieId);
    const playerIds = await GameStateService.getGamePlayerIds(input.player.gameCode);
    for (const playerId of playerIds) {
      publishPlayerMatch(input.server, input.player.gameCode, playerId, result.movieId);
    }
  }

  await publishStateForGame(input.server, input.player.gameCode);
  return result;
};

export const leaveSwipe = async (input: {
  player: PlayerSession;
  server: RealtimeServer;
}) => {
  const result = await GameStateService.leaveGame(input.player);
  publishPlayerLeft(input.server, result.gameCode, result.playerId);
  await publishStateForGame(input.server, result.gameCode);
  return result;
};

export const openSwipeConnection = GamePresenceService.connectPlayer;
export const closeSwipeConnection = GamePresenceService.disconnectPlayer;
export const subscribeSwipeSocket = GamePresenceService.subscribePlayerSocket;
export const unsubscribeSwipeSocket = GamePresenceService.unsubscribePlayerSocket;

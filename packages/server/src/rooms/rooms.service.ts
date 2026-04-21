import type {RoomSession, SwipeChoice} from "@deckflix/shared";
import {deleteGame} from "../games/game.service";
import {
  connectDisplay,
  connectPlayer,
  disconnectDisplay,
  disconnectPlayer,
  publishMatchFound,
  publishPlayerJoined,
  publishPlayerLeft,
  publishPlayerMatch,
  publishRoomState,
  publishVoteRecorded,
  subscribeDisplaySocket,
  subscribePlayerSocket,
  unsubscribeDisplaySocket,
  unsubscribePlayerSocket,
} from "../games/game-presence.service";
import {
  assertRoomSessionAvailable,
  getActiveRoomClient,
  getRoomClient,
} from "../games/game-session.service";
import {
  getDisplayGameState,
  getGameMeta,
  getGamePlayers,
  getGameResults,
  getPlayerGameState,
} from "../games/game-snapshot.service";
import {getGamePlayerIds, joinGame, leaveGame, recordVote} from "../games/game-state.service";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getActiveClient = (session: RoomSession | null) =>
  getActiveRoomClient(session);

export const getClient = (input: {gameCode: string; session: RoomSession | null}) =>
  getRoomClient(input);

export const getMeta = (gameCode: string) => getGameMeta(gameCode);
export const getPlayers = (gameCode: string) => getGamePlayers(gameCode);
export const getResults = (gameCode: string) => getGameResults(gameCode);
export const getDisplayState = (gameCode: string) => getDisplayGameState(gameCode);
export const getPlayerState = (input: {gameCode: string; playerId: string}) =>
  getPlayerGameState(input);
export const ensureRoomSessionAvailable = (session: RoomSession | null) =>
  assertRoomSessionAvailable(session);

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await getGamePlayerIds(gameCode);
  publishRoomState(server, gameCode, playerIds);
};

export const join = async (input: {
  gameCode: string;
  displayName: string;
  server: RealtimeServer;
}) => {
  const result = await joinGame(input);
  publishPlayerJoined(input.server, result.gameCode, result.player);
  await publishStateForGame(input.server, result.gameCode);
  return result;
};

export const vote = async (input: {
  player: {gameCode: string; playerId: string; sessionToken: string};
  assignmentId: string;
  movieId: string;
  choice: SwipeChoice;
  server: RealtimeServer;
}) => {
  const result = await recordVote({
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
    const playerIds = await getGamePlayerIds(input.player.gameCode);
    for (const playerId of playerIds) {
      publishPlayerMatch(input.server, input.player.gameCode, playerId, result.movieId);
    }
  }

  await publishStateForGame(input.server, input.player.gameCode);
  return result;
};

export const leave = async (input: {
  player: {gameCode: string; playerId: string; sessionToken: string};
  server: RealtimeServer;
}) => {
  const result = await leaveGame(input.player);
  publishPlayerLeft(input.server, result.gameCode, result.playerId);
  await publishStateForGame(input.server, result.gameCode);
  return result;
};

export const remove = (input: {
  gameCode: string;
  displayId: string;
  sessionToken: string;
}) => deleteGame(input);

export const openDisplayConnection = connectDisplay;
export const closeDisplayConnection = disconnectDisplay;
export const openPlayerConnection = connectPlayer;
export const closePlayerConnection = disconnectPlayer;
export const subscribeDisplay = subscribeDisplaySocket;
export const unsubscribeDisplay = unsubscribeDisplaySocket;
export const subscribePlayer = subscribePlayerSocket;
export const unsubscribePlayer = unsubscribePlayerSocket;
export const publishState = publishStateForGame;

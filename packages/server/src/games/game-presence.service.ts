import type {GamePlayerPresence, SwipeChoice} from "@deckflix/shared";
import type {DisplaySession, PlayerSession} from "@deckflix/shared";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  subscribeToDisplay,
  subscribeToPlayer,
  unsubscribeFromDisplay,
  unsubscribeFromPlayer,
} from "../ws/topics";
import {getDisplayGameState, getPlayerGameState} from "./game-snapshot.service";
import {verifyDisplaySession, verifyPlayerSession} from "./game-session.service";

export type SocketLike = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type TopicSocket = {raw?: {subscribe: (topic: string) => void; unsubscribe: (topic: string) => void}};
type SocketServer = {
  publish: (topic: string, payload: string) => void;
};

const displaySocketsByGameCode = new Map<string, Set<SocketLike>>();
const playerSocketsByGameCode = new Map<string, Map<string, Set<SocketLike>>>();

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

export const isDisplayConnected = (gameCode: string) =>
  Boolean(displaySocketsByGameCode.get(normalizeGameCode(gameCode))?.size);

export const isPlayerConnected = (gameCode: string, playerId: string) =>
  Boolean(
    playerSocketsByGameCode.get(normalizeGameCode(gameCode))?.get(playerId)?.size,
  );

export const clearPresenceState = (gameCode: string) => {
  const key = normalizeGameCode(gameCode);
  displaySocketsByGameCode.delete(key);
  playerSocketsByGameCode.delete(key);
};

export const connectDisplay = async (input: DisplaySession & {socket: SocketLike}) => {
  await verifyDisplaySession(input);
  const key = normalizeGameCode(input.gameCode);
  const sockets = displaySocketsByGameCode.get(key) ?? new Set<SocketLike>();
  sockets.add(input.socket);
  displaySocketsByGameCode.set(key, sockets);
};

export const disconnectDisplay = (input: {gameCode: string; socket: SocketLike}) => {
  const key = normalizeGameCode(input.gameCode);
  const sockets = displaySocketsByGameCode.get(key);
  if (!sockets) {
    return;
  }

  sockets.delete(input.socket);
  if (sockets.size === 0) {
    displaySocketsByGameCode.delete(key);
  }
};

export const connectPlayer = async (input: PlayerSession & {socket: SocketLike}) => {
  await verifyPlayerSession(input);
  const key = normalizeGameCode(input.gameCode);
  const gameSockets = playerSocketsByGameCode.get(key) ?? new Map<string, Set<SocketLike>>();
  const playerSockets = gameSockets.get(input.playerId) ?? new Set<SocketLike>();
  playerSockets.add(input.socket);
  gameSockets.set(input.playerId, playerSockets);
  playerSocketsByGameCode.set(key, gameSockets);
};

export const disconnectPlayer = (input: {
  gameCode: string;
  playerId: string;
  socket: SocketLike;
}) => {
  const key = normalizeGameCode(input.gameCode);
  const gameSockets = playerSocketsByGameCode.get(key);
  if (!gameSockets) {
    return;
  }

  const playerSockets = gameSockets.get(input.playerId);
  if (!playerSockets) {
    return;
  }

  playerSockets.delete(input.socket);
  if (playerSockets.size === 0) {
    gameSockets.delete(input.playerId);
  }

  if (gameSockets.size === 0) {
    playerSocketsByGameCode.delete(key);
  }
};

export const subscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  subscribeToDisplay(ws as never, gameCode);
};

export const unsubscribeDisplaySocket = (ws: TopicSocket, gameCode: string) => {
  unsubscribeFromDisplay(ws as never, gameCode);
};

export const subscribePlayerSocket = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  subscribeToPlayer(ws as never, gameCode, playerId);
};

export const unsubscribePlayerSocket = (
  ws: TopicSocket,
  gameCode: string,
  playerId: string,
) => {
  unsubscribeFromPlayer(ws as never, gameCode, playerId);
};

export const publishDisplayState = (server: SocketServer, gameCode: string) => {
  void getDisplayGameState(gameCode)
    .then((state) => {
      publishDisplayMessage(server as never, gameCode, {
        type: "display.snapshot",
        payload: state,
      });
    })
    .catch(() => {});
};

export const publishPlayerStates = (
  server: SocketServer,
  gameCode: string,
  playerIds: string[],
) => {
  void Promise.all(
    playerIds.map(async (playerId) => {
      publishPlayerMessage(server as never, gameCode, playerId, {
        type: "player.snapshot",
        payload: await getPlayerGameState({
          gameCode,
          playerId,
        }),
      });
    }),
  ).catch(() => {});
};

export const publishRoomState = (
  server: SocketServer,
  gameCode: string,
  playerIds: string[],
) => {
  publishDisplayState(server, gameCode);
  publishPlayerStates(server, gameCode, playerIds);
};

export const publishPlayerJoined = (
  server: SocketServer,
  gameCode: string,
  player: GamePlayerPresence,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.player_joined",
    payload: player,
  });
};

export const publishPlayerLeft = (
  server: SocketServer,
  gameCode: string,
  playerId: string,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.player_left",
    payload: {playerId},
  });
};

export const publishMatchFound = (
  server: SocketServer,
  gameCode: string,
  movieId: string,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.match_found",
    payload: {movieId},
  });
};

export const publishVoteRecorded = (input: {
  server: SocketServer;
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

export const publishPlayerMatch = (
  server: SocketServer,
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  publishPlayerMessage(server as never, gameCode, playerId, {
    type: "player.match_found",
    payload: {movieId},
  });
};

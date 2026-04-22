import type {DisplaySession, PlayerSession} from "@deckflix/shared";
import {
  subscribeDisplaySocket as subscribeToDisplay,
  unsubscribeDisplaySocket as unsubscribeFromDisplay,
} from "../realtime/display-channel";
import {
  subscribePlayerSocket as subscribeToPlayer,
  unsubscribePlayerSocket as unsubscribeFromPlayer,
} from "../realtime/player-channel";
import * as RoomSessionService from "../rooms/room-session.service";

export type SocketLike = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type TopicSocket = {
  raw?: {
    subscribe: (topic: string) => void;
    unsubscribe: (topic: string) => void;
  };
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
  await RoomSessionService.verifyDisplaySession(input);
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
  await RoomSessionService.verifyPlayerSession(input);
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

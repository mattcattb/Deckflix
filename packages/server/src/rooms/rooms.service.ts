import type {GamePlayerPresence, RoomSession} from "@deckflix/shared";
import {deleteGame} from "../games/game.service";
import * as GamePresenceService from "../games/game-presence.service";
import {
  assertRoomSessionAvailable,
  getActiveRoomClient,
  getRoomClient,
} from "../games/game-session.service";
import {
  getGameMeta,
  getGamePlayers,
  getGameResults,
} from "../games/game-snapshot.service";
import {getGamePlayerIds, joinGame} from "../games/game-state.service";
import {publishDisplayMessage} from "../ws/topics";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getActiveClient = (session: RoomSession | null) =>
  getActiveRoomClient(session);

export const getClient = (input: {gameCode: string; session: RoomSession | null}) =>
  getRoomClient(input);

export const getMeta = (gameCode: string) => getGameMeta(gameCode);
export const getPlayers = (gameCode: string) => getGamePlayers(gameCode);
export const getResults = (gameCode: string) => getGameResults(gameCode);
export const ensureRoomSessionAvailable = (session: RoomSession | null) =>
  assertRoomSessionAvailable(session);

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await getGamePlayerIds(gameCode);
  GamePresenceService.publishRoomState(server, gameCode, playerIds);
};

const publishPlayerJoined = (
  server: RealtimeServer,
  gameCode: string,
  player: GamePlayerPresence,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.player_joined",
    payload: player,
  });
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

export const remove = (input: {
  gameCode: string;
  displayId: string;
  sessionToken: string;
}) => deleteGame(input);

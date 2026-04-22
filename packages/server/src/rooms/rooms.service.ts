import type {GamePlayerPresence, RoomSession} from "@deckflix/shared";
import * as GameService from "../games/game.service";
import * as GamePresenceService from "../ws/presence.ws";
import * as GameSessionService from "../games/game-session.service";
import * as GameSnapshotService from "../games/game-snapshot.service";
import * as GameStateService from "../games/game-state.service";
import {publishDisplayMessage} from "../ws/topics";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getActiveClient = (session: RoomSession | null) =>
  GameSessionService.getActiveRoomClient(session);

export const getClient = (input: {gameCode: string; session: RoomSession | null}) =>
  GameSessionService.getRoomClient(input);

export const getMeta = (gameCode: string) => GameSnapshotService.getGameMeta(gameCode);
export const getPlayers = (gameCode: string) =>
  GameSnapshotService.getGamePlayers(gameCode);
export const getResults = (gameCode: string) =>
  GameSnapshotService.getGameResults(gameCode);
export const ensureRoomSessionAvailable = (session: RoomSession | null) =>
  GameSessionService.assertRoomSessionAvailable(session);

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await GameStateService.getGamePlayerIds(gameCode);
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
  const result = await GameStateService.joinGame(input);
  publishPlayerJoined(input.server, result.gameCode, result.player);
  await publishStateForGame(input.server, result.gameCode);
  return result;
};

export const remove = (input: {
  gameCode: string;
  displayId: string;
  sessionToken: string;
}) => GameService.deleteGame(input);

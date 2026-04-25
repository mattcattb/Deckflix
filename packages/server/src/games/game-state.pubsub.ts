import type {DisplayGameState, PlayerGameState} from "@deckflix/shared";
import {publishDisplayMessage} from "../realtime/display-channel";
import {publishPlayerMessage} from "../realtime/player-channel";
import type {RealtimeServer} from "../realtime/socket-bus";
import * as GameSnapshotService from "./game-snapshot.service";

export const getProjectedDisplayState = async (
  gameCode: string,
): Promise<DisplayGameState> => GameSnapshotService.getDisplayGameState(gameCode);

export const getProjectedPlayerState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => GameSnapshotService.getPlayerGameState(input);

export const materializeGameState = async (gameCode: string, playerIds: string[]) => {
  const [displayState, playerEntries] = await Promise.all([
    GameSnapshotService.getDisplayGameState(gameCode),
    Promise.all(
      playerIds.map(async (playerId) => [
        playerId,
        await GameSnapshotService.getPlayerGameState({gameCode, playerId}),
      ] as const),
    ),
  ]);

  return {
    displayState,
    playerStates: new Map(playerEntries),
  };
};

export const publishGameState = async (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  const materialized = await materializeGameState(gameCode, playerIds);

  publishDisplayMessage(server, gameCode, {
    type: "display.snapshot",
    payload: materialized.displayState,
  });

  for (const [playerId, state] of materialized.playerStates) {
    publishPlayerMessage(server, gameCode, playerId, {
      type: "player.snapshot",
      payload: state,
    });
  }

  return materialized;
};

export const clearProjectedGameState = async (
  _gameCode: string,
  _playerIds: string[],
) => undefined;

import * as GameSnapshotService from "./game-snapshot.service";
import {publishDisplayMessage} from "../realtime/display-channel";
import {publishPlayerMessage} from "../realtime/player-channel";
import type {RealtimeServer} from "../realtime/socket-bus";

export const publishDisplaySnapshot = (server: RealtimeServer, gameCode: string) => {
  void GameSnapshotService.getDisplayGameState(gameCode)
    .then((state) => {
      publishDisplayMessage(server, gameCode, {
        type: "display.snapshot",
        payload: state,
      });
    })
    .catch(() => {});
};

export const publishPlayerSnapshots = (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  void Promise.all(
    playerIds.map(async (playerId) => {
      publishPlayerMessage(server, gameCode, playerId, {
        type: "player.snapshot",
        payload: await GameSnapshotService.getPlayerGameState({
          gameCode,
          playerId,
        }),
      });
    }),
  ).catch(() => {});
};

export const publishGameState = (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  publishDisplaySnapshot(server, gameCode);
  publishPlayerSnapshots(server, gameCode, playerIds);
};

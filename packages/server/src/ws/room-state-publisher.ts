import * as GameSnapshotService from "../games/game-snapshot.service";
import {publishDisplayMessage, publishPlayerMessage} from "./topics";

type SocketServer = {
  publish: (topic: string, payload: string) => void;
};

export const publishDisplayState = (server: SocketServer, gameCode: string) => {
  void GameSnapshotService.getDisplayGameState(gameCode)
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
        payload: await GameSnapshotService.getPlayerGameState({
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

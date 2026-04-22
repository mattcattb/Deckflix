import {publishDisplayMessage} from "../realtime/display-channel";
import {publishPlayerMessage} from "../realtime/player-channel";
import type {RealtimeServer} from "../realtime/socket-bus";
import type {GameStatus} from "@deckflix/shared";

export const publishRoomStarted = (
  server: RealtimeServer,
  gameCode: string,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "room.started",
  });
};

export const publishRoomStatusChanged = (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
  previousStatus: GameStatus,
  nextStatus: GameStatus,
) => {
  const message = {
    type: "room.status_changed" as const,
    payload: {
      previousStatus,
      nextStatus,
    },
  };

  publishDisplayMessage(server, gameCode, message);
  for (const playerId of playerIds) {
    publishPlayerMessage(server, gameCode, playerId, message);
  }
};

export const publishRoomDeleted = (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  publishDisplayMessage(server, gameCode, {
    type: "room.deleted",
  });

  for (const playerId of playerIds) {
    publishPlayerMessage(server, gameCode, playerId, {
      type: "room.deleted",
    });
  }
};

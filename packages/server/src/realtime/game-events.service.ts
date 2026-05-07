import type {GamePlayerPresence, GameStatus} from "@deckflix/shared";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  type RealtimeServer,
} from "./realtime.service";
import {publishPlayerSnapshots} from "../rooms/game-state.service";

export const publishPlayerRoomSnapshots = async (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  await publishPlayerSnapshots(server, gameCode, playerIds);
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

export const publishRoomStarted = (
  server: RealtimeServer,
  gameCode: string,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "room.started",
  });
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

export const publishPlayerJoined = (
  server: RealtimeServer,
  gameCode: string,
  player: GamePlayerPresence,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "presence.player_joined",
    payload: player,
  });
};

export const publishPlayerLeft = (
  server: RealtimeServer,
  gameCode: string,
  playerId: string,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "presence.player_left",
    payload: {
      playerId,
    },
  });
};

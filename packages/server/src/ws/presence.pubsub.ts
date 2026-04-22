import type {GamePlayerPresence} from "@deckflix/shared";
import {publishDisplayMessage} from "../realtime/display-channel";
import type {RealtimeServer} from "../realtime/socket-bus";

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
    payload: {playerId},
  });
};

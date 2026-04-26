import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  decodeDisplayClientMessage,
  encodeDisplayServerMessage,
} from "@deckflix/shared";
import {ensureSocketPubSub} from "../lib/redis";
import {
  getProjectedDisplayState,
  publishGameState,
} from "../state/game-state.service";
import * as RoomsService from "../rooms/rooms.service";
import * as PresenceService from "../presence/presence.service";

const publishDisplayRoomState = async (
  server: Parameters<typeof publishGameState>[0],
  gameCode: string,
) => {
  const playerIds = await RoomsService.listPlayerIds(gameCode);
  await publishGameState(server, gameCode, playerIds);
};

//! this will be replaced with the overall middleware handler here

export const createDisplaySocketHandler = () =>
  upgradeWebSocket((c) => {
    const {gameCode} = c.get("room");
    const {displayId, sessionToken} = c.get("displayActor");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    return {
      onOpen: (_, ws) => {
        void PresenceService.connectDisplay({
          gameCode,
          displayId,
          sessionToken,
          socket: ws,
        })
          .then(async () => {
            ws.send(
              encodeDisplayServerMessage({
                type: "display.snapshot",
                payload: await getProjectedDisplayState(gameCode),
              }),
            );
            void publishDisplayRoomState(server, gameCode);
            PresenceService.subscribeDisplaySocket(ws, gameCode);
          })
          .catch(() => {
            ws.close(4001, "Invalid display session");
          });
      },
      onClose: (_, ws) => {
        PresenceService.unsubscribeDisplaySocket(ws, gameCode);
        PresenceService.disconnectDisplay({
          gameCode,
          socket: ws,
        });
        void publishDisplayRoomState(server, gameCode);
      },
      onMessage: (event, ws) => {
        try {
          const parsed = decodeDisplayClientMessage(event.data as string);
          if (parsed.type === "socket.ping") {
            ws.send(encodeDisplayServerMessage({type: "socket.pong"}));
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Invalid websocket message";
          ws.send(
            encodeDisplayServerMessage({
              type: "socket.error",
              payload: {message},
            }),
          );
        }
      },
    };
  });

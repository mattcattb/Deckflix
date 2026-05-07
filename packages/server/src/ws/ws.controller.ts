import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  decodeDisplayClientMessage,
  decodePlayerClientMessage,
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import * as PresenceService from "../presence/presence.service";
import * as RealtimeService from "../realtime/realtime.service";
import {ensureSocketPubSub} from "../realtime/socket-pubsub.service";
import {
  getProjectedPlayerState,
  getProjectedDisplayState,
  publishGameState,
} from "../rooms/game-state.service";
import {activeRoomMiddleware} from "../rooms/rooms.middleware";
import * as RoomsService from "../rooms/rooms.service";

const publishRoomState = async (
  server: Parameters<typeof publishGameState>[0],
  gameCode: string,
) => {
  const playerIds = await RoomsService.listPlayerIds(gameCode);
  await publishGameState(server, gameCode, playerIds);
};

const createSocketHandler = () =>
  upgradeWebSocket((c) => {
    const {gameCode, session} = c.get("room");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    if (session?.role === "display") {
      return {
        onOpen: (_, ws) => {
          void (async () => {
            try {
              PresenceService.connectDisplay({
                gameCode,
                socket: ws,
              });
              ws.send(
                encodeDisplayServerMessage({
                  type: "display.snapshot",
                  payload: await getProjectedDisplayState(gameCode),
                }),
              );
              void publishRoomState(server, gameCode);
              RealtimeService.subscribeDisplaySocket(ws, gameCode);
            } catch {
              ws.close(4001, "Invalid display session");
            }
          })();
        },
        onClose: (_, ws) => {
          RealtimeService.unsubscribeDisplaySocket(ws, gameCode);
          PresenceService.disconnectDisplay({
            gameCode,
            socket: ws,
          });
          void publishRoomState(server, gameCode);
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
    }

    const playerId = session?.roleId ?? "";

    return {
      onOpen: (_, ws) => {
        void (async () => {
          try {
            PresenceService.connectPlayer({
              gameCode,
              playerId,
              socket: ws,
            });
            ws.send(
              encodePlayerServerMessage({
                type: "player.snapshot",
                payload: await getProjectedPlayerState({gameCode, playerId}),
              }),
            );
            void publishRoomState(server, gameCode);
            RealtimeService.subscribePlayerSocket(ws, gameCode, playerId);
          } catch {
            ws.close(4001, "Invalid player session");
          }
        })();
      },
      onClose: (_, ws) => {
        RealtimeService.unsubscribePlayerSocket(ws, gameCode, playerId);
        PresenceService.disconnectPlayer({
          gameCode,
          playerId,
          socket: ws,
        });
        void publishRoomState(server, gameCode);
      },
      onMessage: (event, ws) => {
        try {
          const parsed = decodePlayerClientMessage(event.data as string);
          if (parsed.type === "socket.ping") {
            ws.send(encodePlayerServerMessage({type: "socket.pong"}));
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Invalid websocket message";
          ws.send(
            encodePlayerServerMessage({
              type: "socket.error",
              payload: {message},
            }),
          );
        }
      },
    };
  });

export const wsController = createRouter()
  .use("*", activeRoomMiddleware)
  .get("/", createSocketHandler());

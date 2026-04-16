import {zValidator} from "@hono/zod-validator";
import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  createRoomPayloadSchema,
  decodeRoomClientMessage,
  encodeRoomServerMessage,
  joinRoomPayloadSchema,
  swipeRoomPayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {optionalAuthMiddleware} from "../auth/auth.middleware";
import {ensureSocketPubSub} from "../lib/redis";
import * as RoomService from "./rooms.service";
import {
  publishRoomMessage,
  subscribeToRoom,
  unsubscribeFromRoom,
} from "../ws/topics";

const publishSnapshot = (server: Parameters<typeof ensureSocketPubSub>[0], roomCode: string) => {
  try {
    publishRoomMessage(server, roomCode, {
      type: "room.snapshot",
      payload: RoomService.getRoomSnapshot(roomCode),
    });
  } catch {
    // Ignore missing-room broadcasts during disconnect races.
  }
};

export const roomsController = createRouter()
  .use("*", optionalAuthMiddleware)
  .post("/", zValidator("json", createRoomPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await RoomService.createRoom({
      displayName: input.displayName,
      settings: input.settings,
      userId: c.get("userId"),
    });
    return c.json(result, 201);
  })
  .post("/:roomCode/join", zValidator("json", joinRoomPayloadSchema), async (c) => {
    const roomCode = c.req.param("roomCode");
    const input = c.req.valid("json");
    const result = RoomService.joinRoom({
      roomCode,
      displayName: input.displayName,
      userId: c.get("userId"),
    });
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    publishSnapshot(server, result.room.code);
    return c.json(result, 201);
  })
  .post("/:roomCode/swipes", zValidator("json", swipeRoomPayloadSchema), async (c) => {
    const roomCode = c.req.param("roomCode");
    const input = c.req.valid("json");
    const result = RoomService.recordSwipe({
      roomCode,
      memberId: input.memberId,
      sessionToken: input.sessionToken,
      movieId: input.movieId,
      choice: input.choice,
    });
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    if (result.justMatched) {
      publishRoomMessage(server, roomCode, {
        type: "room.match_found",
        payload: {
          movieId: result.movieId,
        },
      });
    }

    publishRoomMessage(server, roomCode, {
      type: "room.snapshot",
      payload: result.snapshot,
    });

    return c.json(result, 201);
  })
  .get("/:roomCode", async (c) => {
    const roomCode = c.req.param("roomCode");
    return c.json(RoomService.getRoomSnapshot(roomCode));
  })
  .get(
    "/:roomCode/ws",
    upgradeWebSocket((c) => {
      const roomCode = c.req.param("roomCode");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const memberId = c.req.query("memberId");
      const sessionToken = c.req.query("sessionToken");

      if (!memberId || !sessionToken) {
        return {
          onOpen: (_, ws) => ws.close(4001, "Missing room session"),
        };
      }

      return {
        onOpen: (_, ws) => {
          try {
            RoomService.connectMember({
              roomCode,
              memberId,
              sessionToken,
              socket: ws,
            });
            ws.send(encodeRoomServerMessage({
              type: "room.snapshot",
              payload: RoomService.getRoomSnapshot(roomCode),
            }));
            publishSnapshot(server, roomCode);
            subscribeToRoom(ws, roomCode);
          } catch {
            ws.close(4001, "Unauthorized");
          }
        },
        onClose: (_, ws) => {
          unsubscribeFromRoom(ws, roomCode);
          RoomService.disconnectMember({
            roomCode,
            memberId,
            socket: ws,
          });
          publishSnapshot(server, roomCode);
        },
        onMessage: (event, ws) => {
          try {
            const parsed = decodeRoomClientMessage(event.data as string);

            if (parsed.type === "ping") {
              ws.send(encodeRoomServerMessage({type: "pong"}));
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Invalid websocket message";
            ws.send(encodeRoomServerMessage({
              type: "room.error",
              payload: {message},
            }));
          }
        },
      };
    }),
  );

import {zValidator} from "@hono/zod-validator";
import {upgradeWebSocket} from "hono/bun";
import {createRouter} from "../common/hono";
import {optionalAuthMiddleware} from "../auth/auth.middleware";
import {
  createRoomSchema,
  joinRoomSchema,
  wsClientMessageSchema,
} from "./rooms.schema";
import {roomService} from "./rooms.service";

const broadcastSnapshot = (roomCode: string) => {
  try {
    roomService.broadcast(roomCode, {
      type: "room.snapshot",
      payload: roomService.getRoomSnapshot(roomCode),
    });
  } catch {
    // Ignore missing-room broadcasts during disconnect races.
  }
};

export const roomsController = createRouter()
  .use("*", optionalAuthMiddleware)
  .post("/", zValidator("json", createRoomSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await roomService.createRoom({
      displayName: input.displayName,
      settings: input.settings,
      userId: c.get("userId"),
    });
    return c.json(result, 201);
  })
  .post("/:roomCode/join", zValidator("json", joinRoomSchema), async (c) => {
    const roomCode = c.req.param("roomCode");
    const input = c.req.valid("json");
    const result = roomService.joinRoom({
      roomCode,
      displayName: input.displayName,
      userId: c.get("userId"),
    });
    broadcastSnapshot(result.room.code);
    return c.json(result, 201);
  })
  .get("/:roomCode", async (c) => {
    const roomCode = c.req.param("roomCode");
    return c.json(roomService.getRoomSnapshot(roomCode));
  })
  .get(
    "/:roomCode/ws",
    upgradeWebSocket((c) => {
      const roomCode = c.req.param("roomCode");
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
            roomService.connectMember({
              roomCode,
              memberId,
              sessionToken,
              socket: ws,
            });
            ws.send(
              JSON.stringify({
                type: "room.snapshot",
                payload: roomService.getRoomSnapshot(roomCode),
              }),
            );
            broadcastSnapshot(roomCode);
          } catch {
            ws.close(4001, "Unauthorized");
          }
        },
        onClose: (_, ws) => {
          roomService.disconnectMember({
            roomCode,
            memberId,
            socket: ws,
          });
          broadcastSnapshot(roomCode);
        },
        onMessage: (event, ws) => {
          try {
            const parsed = wsClientMessageSchema.parse(
              JSON.parse(event.data as string),
            );

            if (parsed.type === "ping") {
              ws.send(JSON.stringify({type: "pong"}));
              return;
            }

            const result = roomService.recordSwipe({
              roomCode,
              memberId,
              sessionToken,
              movieId: parsed.payload.movieId,
              choice: parsed.payload.choice,
            });

            if (result.justMatched) {
              roomService.broadcast(roomCode, {
                type: "room.match_found",
                payload: {
                  movieId: result.movieId,
                },
              });
            }

            roomService.broadcast(roomCode, {
              type: "room.snapshot",
              payload: result.snapshot,
            });
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Invalid websocket message";
            ws.send(
              JSON.stringify({
                type: "room.error",
                payload: {message},
              }),
            );
          }
        },
      };
    }),
  );

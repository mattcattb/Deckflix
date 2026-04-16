import {zValidator} from "@hono/zod-validator";
import {getBunServer, upgradeWebSocket} from "hono/bun";
import {deleteCookie, getCookie, setCookie} from "hono/cookie";
import {createMiddleware} from "hono/factory";
import {
  createRoomPayloadSchema,
  decodeRoomClientMessage,
  encodeRoomServerMessage,
  joinRoomPayloadSchema,
  swipeRoomPayloadSchema,
} from "@deckflix/shared";
import {z} from "zod";
import {createRouter} from "../common/hono";
import {UnauthorizedException} from "../common/errors";
import {ensureSocketPubSub} from "../lib/redis";
import * as RoomService from "./rooms.service";
import {
  publishRoomMessage,
  subscribeToRoom,
  unsubscribeFromRoom,
} from "../ws/topics";

const publishSnapshot = (server: Parameters<typeof ensureSocketPubSub>[0], roomCode: string) => {
  void RoomService.getRoomSnapshot(roomCode)
    .then((snapshot) => {
      publishRoomMessage(server, roomCode, {
        type: "room.snapshot",
        payload: snapshot,
      });
    })
    .catch(() => {
      // Ignore missing-room broadcasts during disconnect races.
    });
};

const roomParticipantCookieValueSchema = z.object({
  memberId: z.string().min(1),
  sessionToken: z.string().min(1),
});

const getRoomParticipantCookieName = (roomCode: string) =>
  `deckflix_room_${roomCode.trim().toUpperCase()}`;

const encodeRoomParticipantCookieValue = (value: {
  memberId: string;
  sessionToken: string;
}) => `${value.memberId}.${value.sessionToken}`;

const decodeRoomParticipantCookieValue = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const [memberId, sessionToken] = value.split(".", 2);
  const parsed = roomParticipantCookieValueSchema.safeParse({
    memberId,
    sessionToken,
  });

  return parsed.success ? parsed.data : null;
};

const setRoomParticipantCookie = (
  c: Parameters<typeof setCookie>[0],
  roomCode: string,
  session: {memberId: string; sessionToken: string},
) => {
  setCookie(
    c,
    getRoomParticipantCookieName(roomCode),
    encodeRoomParticipantCookieValue(session),
    {
      httpOnly: true,
      sameSite: "Lax",
      path: `/api/rooms/${roomCode.toUpperCase()}`,
    },
  );
};

const clearRoomParticipantCookie = (
  c: Parameters<typeof deleteCookie>[0],
  roomCode: string,
) => {
  deleteCookie(c, getRoomParticipantCookieName(roomCode), {
    httpOnly: true,
    sameSite: "Lax",
    path: `/api/rooms/${roomCode.toUpperCase()}`,
  });
};

const roomParticipantMiddleware = createMiddleware(async (c, next) => {
  const roomCodeParam = c.req.param("roomCode");
  if (!roomCodeParam) {
    throw new UnauthorizedException("Missing room code");
  }

  const roomCode = roomCodeParam.trim().toUpperCase();
  const parsed = decodeRoomParticipantCookieValue(
    getCookie(c, getRoomParticipantCookieName(roomCode)),
  );

  if (!parsed) {
    throw new UnauthorizedException("Missing room participant session");
  }
  await RoomService.verifyRoomParticipantSession({
    roomCode,
    memberId: parsed.memberId,
    sessionToken: parsed.sessionToken,
  });

  c.set("roomParticipant", {
    roomCode,
    memberId: parsed.memberId,
    sessionToken: parsed.sessionToken,
  });

  await next();
});

export const roomsController = createRouter()
  .post("/", zValidator("json", createRoomPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await RoomService.createRoom({
      displayName: input.displayName,
      settings: input.settings,
    });
    setRoomParticipantCookie(c, result.room.code, result.session);
    return c.json(result, 201);
  })
  .post("/:roomCode/join", zValidator("json", joinRoomPayloadSchema), async (c) => {
    const roomCode = c.req.param("roomCode");
    const input = c.req.valid("json");
    const result = await RoomService.joinRoom({
      roomCode,
      displayName: input.displayName,
    });
    setRoomParticipantCookie(c, result.room.code, result.session);
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    publishSnapshot(server, result.room.code);
    return c.json(result, 201);
  })
  .post(
    "/:roomCode/swipes",
    roomParticipantMiddleware,
    zValidator("json", swipeRoomPayloadSchema),
    async (c) => {
      const roomCode = c.req.param("roomCode");
      const input = c.req.valid("json");
      const result = await RoomService.recordSwipe({
        participant: c.get("roomParticipant"),
        movieId: input.movieId,
        choice: input.choice,
      });
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);

      if (result.cardCompleted) {
        publishRoomMessage(server, roomCode, {
          type: "room.card_complete",
          payload: result.cardSummary,
        });
      }

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
    },
  )
  .get("/:roomCode", async (c) => {
    const roomCode = c.req.param("roomCode");
    const participant = decodeRoomParticipantCookieValue(
      getCookie(c, getRoomParticipantCookieName(roomCode)),
    );

    if (!participant) {
      return c.json(await RoomService.getRoomSnapshotForViewer(roomCode, null));
    }

    try {
      await RoomService.verifyRoomParticipantSession({
        roomCode,
        memberId: participant.memberId,
        sessionToken: participant.sessionToken,
      });

      return c.json(
        await RoomService.getRoomSnapshotForViewer(roomCode, participant.memberId),
      );
    } catch {
      clearRoomParticipantCookie(c, roomCode);
      return c.json(await RoomService.getRoomSnapshotForViewer(roomCode, null));
    }
  })
  .post("/:roomCode/leave", roomParticipantMiddleware, async (c) => {
    const roomCode = c.req.param("roomCode");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    await RoomService.leaveRoom(c.get("roomParticipant"));
    clearRoomParticipantCookie(c, roomCode);
    publishSnapshot(server, roomCode);

    return c.body(null, 204);
  })
  .get(
    "/:roomCode/ws",
    upgradeWebSocket((c) => {
      const roomCode = c.req.param("roomCode");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const participant = decodeRoomParticipantCookieValue(
        getCookie(c, getRoomParticipantCookieName(roomCode)),
      );

      if (!participant) {
        return {
          onOpen: (_, ws) => ws.close(4001, "Missing room session"),
        };
      }

      return {
        onOpen: (_, ws) => {
          void RoomService.connectMember({
            roomCode,
            memberId: participant.memberId,
            sessionToken: participant.sessionToken,
            socket: ws,
          })
            .then(async () => {
              ws.send(encodeRoomServerMessage({
                type: "room.snapshot",
                payload: await RoomService.getRoomSnapshotForViewer(
                  roomCode,
                  participant.memberId,
                ),
              }));
              publishSnapshot(server, roomCode);
              subscribeToRoom(ws, roomCode);
            })
            .catch(() => {
              ws.close(4001, "Invalid room participant session");
            });
        },
        onClose: (_, ws) => {
          unsubscribeFromRoom(ws, roomCode);
          RoomService.disconnectMember({
            roomCode,
            memberId: participant.memberId,
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

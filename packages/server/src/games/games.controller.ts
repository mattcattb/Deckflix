import {zValidator} from "@hono/zod-validator";
import {createGamePayloadSchema} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {clearRoomSessionCookie, readRoomSessionCookie, setRoomSessionCookie} from "../rooms/rooms.middleware";
import * as RoomsService from "../rooms/rooms.service";

export const gamesController = createRouter()
  .post("/", zValidator("json", createGamePayloadSchema), async (c) => {
    const session = readRoomSessionCookie(c);
    await RoomsService.ensureRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }

    const input = c.req.valid("json");
    const result = await RoomsService.create({
      roomName: input.roomName,
      settings: input.settings,
    });

    setRoomSessionCookie(c, {
      gameCode: result.gameCode,
      role: "display",
      roleId: result.displaySession.displayId,
      sessionToken: result.displaySession.sessionToken,
    });

    return c.json(result, 201);
  });

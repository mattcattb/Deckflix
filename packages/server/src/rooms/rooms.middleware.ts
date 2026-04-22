import {roomSessionSchema, type RoomSession} from "@deckflix/shared";
import {deleteCookie, getCookie, setCookie} from "hono/cookie";
import {createMiddleware} from "hono/factory";
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import * as RoomSessionService from "./room-session.service";
import * as RoomMetaService from "./room-meta.service";

const ACTIVE_GAME_COOKIE_NAME = "deckflix_active_game";

type CookieContext = Parameters<typeof getCookie>[0];

const encodeRoomSessionCookieValue = (value: RoomSession) =>
  `${value.gameCode}.${value.role}.${value.roleId}.${value.sessionToken}`;

const decodeRoomSessionCookieValue = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const [gameCode, role, roleId, sessionToken] = value.split(".", 4);
  const parsed = roomSessionSchema.safeParse({
    gameCode,
    role,
    roleId,
    sessionToken,
  });

  return parsed.success ? parsed.data : null;
};

export const setRoomSessionCookie = (
  c: Parameters<typeof setCookie>[0],
  session: RoomSession,
) => {
  setCookie(
    c,
    ACTIVE_GAME_COOKIE_NAME,
    encodeRoomSessionCookieValue(session),
    {
      httpOnly: true,
      sameSite: "Lax",
      path: "/api",
    },
  );
};

export const clearRoomSessionCookie = (c: Parameters<typeof deleteCookie>[0]) => {
  deleteCookie(c, ACTIVE_GAME_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/api",
  });
};

export const readRoomSessionCookie = (c: CookieContext) =>
  decodeRoomSessionCookieValue(getCookie(c, ACTIVE_GAME_COOKIE_NAME));

const resolveRoomScopedSession = async (c: CookieContext, gameCode: string) => {
  const session = readRoomSessionCookie(c);
  if (!session || session.gameCode !== gameCode) {
    return null;
  }

  try {
    return await RoomSessionService.verifyRoomSession(session);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      clearRoomSessionCookie(c);
      return null;
    }

    throw error;
  }
};

export const roomMiddleware = createMiddleware(async (c, next) => {
  const gameCode = c.req.param("gameCode");
  if (!gameCode) {
    throw new UnauthorizedException("Missing game code");
  }

  const normalizedGameCode = gameCode.trim().toUpperCase();
  c.set("room", {
    gameCode: normalizedGameCode,
    session: await resolveRoomScopedSession(c, normalizedGameCode),
    meta: await RoomMetaService.getGameMetaOrThrow(normalizedGameCode),
  });

  await next();
});

const getRequiredRoomSession = async (c: CookieContext) => {
  const session = readRoomSessionCookie(c);
  if (!session) {
    throw new NotFoundException("Room not found");
  }

  try {
    return await RoomSessionService.verifyRoomSession(session);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      clearRoomSessionCookie(c);
      throw new NotFoundException("Room not found");
    }

    throw error;
  }
};

export const activeRoomMiddleware = createMiddleware(async (c, next) => {
  const session = await getRequiredRoomSession(c);
  c.set("room", {
    gameCode: session.gameCode,
    session,
    meta: await RoomMetaService.getGameMetaOrThrow(session.gameCode),
  });

  await next();
});

export const activePlayerSessionMiddleware = createMiddleware(async (c, next) => {
  const session = await getRequiredRoomSession(c);
  if (session.role !== "player") {
    throw new NotFoundException("Room not found");
  }

  c.set("room", {
    gameCode: session.gameCode,
    session,
    meta: await RoomMetaService.getGameMetaOrThrow(session.gameCode),
  });
  c.set("playerActor", {
    playerId: session.roleId,
    sessionToken: session.sessionToken,
  });

  await next();
});

export const activeDisplaySessionMiddleware = createMiddleware(async (c, next) => {
  const session = await getRequiredRoomSession(c);
  if (session.role !== "display") {
    throw new NotFoundException("Room not found");
  }

  c.set("room", {
    gameCode: session.gameCode,
    session,
    meta: await RoomMetaService.getGameMetaOrThrow(session.gameCode),
  });
  c.set("displayActor", {
    displayId: session.roleId,
    sessionToken: session.sessionToken,
  });

  await next();
});

const requireRoomStatus = (
  statuses: Array<RoomMetaService.GameMetaRecord["status"]>,
  message: string,
) =>
  createMiddleware(async (c, next) => {
    const room = c.get("room");
    const meta = await RoomMetaService.getGameMetaOrThrow(room.gameCode);
    c.set("room", {
      ...room,
      meta,
    });
    if (!statuses.includes(meta.status)) {
      throw new ConflictException(message);
    }

    await next();
  });

export const requireGameLobby = requireRoomStatus(
  ["lobby"],
  "Game must be in the lobby",
);

export const requireStartedGame = requireRoomStatus(
  ["swiping"],
  "Game must be started",
);

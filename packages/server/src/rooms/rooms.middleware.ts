import {
  encodeRoomSessionToken,
  type RoomSession,
} from "@deckflix/shared";
import {deleteCookie, getCookie, setCookie} from "hono/cookie";
import {createMiddleware} from "hono/factory";
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import {appEnv} from "../common/env";
import * as RoomsService from "./rooms.service";
import * as SessionService from "../sessions/room-session.service";

const ACTIVE_GAME_COOKIE_NAME = "deckflix_active_game";
const isProduction =
  appEnv.NODE_ENV === "production" ||
  appEnv.BETTER_AUTH_URL.startsWith("https://") ||
  appEnv.PUBLIC_APP_URL?.startsWith("https://") === true;
const roomSessionCookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? "None" : "Lax",
  secure: isProduction,
  path: "/api",
} as const;

type CookieContext = Parameters<typeof getCookie>[0];

export const setRoomSessionCookie = (
  c: Parameters<typeof setCookie>[0],
  session: RoomSession,
) => {
  setCookie(
    c,
    ACTIVE_GAME_COOKIE_NAME,
    encodeRoomSessionToken(session),
    roomSessionCookieOptions,
  );
};

export const clearRoomSessionCookie = (c: Parameters<typeof deleteCookie>[0]) => {
  deleteCookie(c, ACTIVE_GAME_COOKIE_NAME, roomSessionCookieOptions);
};

export const readRequestRoomSession = (c: CookieContext) =>
  SessionService.readRoomSession({
    authorization: c.req.header("Authorization"),
    roomSessionToken: c.req.query("roomSessionToken"),
    cookieSessionToken: getCookie(c, ACTIVE_GAME_COOKIE_NAME),
  });

export const gameParamMiddleware = createMiddleware(async (c, next) => {
  const gameCode = c.req.param("gameCode");
  if (!gameCode) {
    throw new UnauthorizedException("Missing game code");
  }

  const normalizedGameCode = gameCode.trim().toUpperCase();
  c.set("room", {
    gameCode: normalizedGameCode,
    session: null,
    meta: await RoomsService.getGameMetaOrThrow(normalizedGameCode),
  });

  await next();
});

const getRequiredRoomSession = async (c: CookieContext) => {
  const session = readRequestRoomSession(c);
  if (!session) {
    throw new NotFoundException("Room not found");
  }

  try {
    return await SessionService.verifyRoomSession(session);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      clearRoomSessionCookie(c);
      throw new NotFoundException("Room not found");
    }

    throw error;
  }
};

const getRequiredActiveRoomMeta = async (
  c: CookieContext,
  gameCode: string,
) => {
  try {
    return await RoomsService.getGameMetaOrThrow(gameCode);
  } catch (error) {
    if (error instanceof NotFoundException) {
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
    meta: await getRequiredActiveRoomMeta(c, session.gameCode),
  });

  await next();
});

export const requirePlayerActor = createMiddleware(async (c, next) => {
  const room = c.get("room");
  if (room.session?.role !== "player") {
    throw new NotFoundException("Room not found");
  }

  c.set("playerActor", {
    playerId: room.session.roleId,
    sessionToken: room.session.sessionToken,
  });

  await next();
});

export const requireDisplayActor = createMiddleware(async (c, next) => {
  const room = c.get("room");
  if (room.session?.role !== "display") {
    throw new NotFoundException("Room not found");
  }

  c.set("displayActor", {
    displayId: room.session.roleId,
    sessionToken: room.session.sessionToken,
  });

  await next();
});

const requireRoomStatus = (
  statuses: Array<RoomsService.GameMetaRecord["status"]>,
  message: string,
) =>
  createMiddleware(async (c, next) => {
    const room = c.get("room");
    if (!statuses.includes(room.meta.status)) {
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

export const requireFinale = requireRoomStatus(
  ["finale"],
  "Game must be in the final round",
);

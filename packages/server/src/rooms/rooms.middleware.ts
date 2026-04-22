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

  c.set("roomRequest", {
    gameCode,
    session: await resolveRoomScopedSession(c, gameCode),
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
  c.set("roomRequest", {
    gameCode: session.gameCode,
    session,
  });

  await next();
});

export const displaySessionMiddleware = createMiddleware(async (c, next) => {
  const {gameCode, session} = c.get("roomRequest");
  if (!session || session.role !== "display") {
    throw new UnauthorizedException("Missing display session");
  }

  c.set("roomSession", session);
  c.set("displaySession", {
    gameCode,
    displayId: session.roleId,
    sessionToken: session.sessionToken,
  });

  await next();
});

export const activeDisplaySessionMiddleware = createMiddleware(async (c, next) => {
  const session = await getRequiredRoomSession(c);
  if (session.role !== "display") {
    throw new NotFoundException("Room not found");
  }

  c.set("roomRequest", {
    gameCode: session.gameCode,
    session,
  });
  c.set("roomSession", session);
  c.set("displaySession", {
    gameCode: session.gameCode,
    displayId: session.roleId,
    sessionToken: session.sessionToken,
  });

  await next();
});

export const playerSessionMiddleware = createMiddleware(async (c, next) => {
  const {gameCode, session} = c.get("roomRequest");
  if (!session || session.role !== "player") {
    throw new UnauthorizedException("Missing player session");
  }

  const playerId = c.req.param("playerId") ?? session.roleId;
  if (playerId !== session.roleId) {
    throw new UnauthorizedException("Player session does not match requested player");
  }

  c.set("roomSession", session);
  c.set("playerSession", {
    gameCode,
    playerId,
    sessionToken: session.sessionToken,
  });

  await next();
});

export const activePlayerSessionMiddleware = createMiddleware(async (c, next) => {
  const session = await getRequiredRoomSession(c);
  if (session.role !== "player") {
    throw new NotFoundException("Room not found");
  }

  c.set("roomRequest", {
    gameCode: session.gameCode,
    session,
  });
  c.set("roomSession", session);
  c.set("playerSession", {
    gameCode: session.gameCode,
    playerId: session.roleId,
    sessionToken: session.sessionToken,
  });

  await next();
});

const requireRoomStatus = (
  statuses: Array<RoomMetaService.GameMetaRecord["status"]>,
  message: string,
) =>
  createMiddleware(async (c, next) => {
    const meta = await RoomMetaService.getGameMetaOrThrow(c.get("roomRequest").gameCode);
    c.set("roomMeta", meta);
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

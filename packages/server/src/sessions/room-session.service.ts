import {
  activeRoomClientSchema,
  decodeRoomSessionToken,
  type ActiveRoomClient,
  type DisplaySession,
  type PlayerSession,
  type RoomSession,
} from "@deckflix/shared";
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import * as PlayerService from "../players/player.service";
import * as RoomsService from "../rooms/rooms.service";

const getRoleConflictMessage = (role: RoomSession["role"]) =>
  role === "display"
    ? "This browser already owns the display for this room"
    : "This browser is already joined to this room as a player";

const isInvalidRoomSessionError = (error: unknown) =>
  error instanceof UnauthorizedException || error instanceof NotFoundException;

const getBearerToken = (authorization?: string | null) => {
  const [scheme, token] = authorization?.split(" ", 2) ?? [];
  return scheme?.toLowerCase() === "bearer" ? token : null;
};

export const readRoomSession = (input: {
  authorization?: string | null;
  roomSessionToken?: string | null;
  cookieSessionToken?: string | null;
}) =>
  decodeRoomSessionToken(getBearerToken(input.authorization)) ??
  decodeRoomSessionToken(input.roomSessionToken) ??
  decodeRoomSessionToken(input.cookieSessionToken);

const verifyDisplaySession = async (input: DisplaySession) => {
  let meta;
  try {
    meta = await RoomsService.getGameMetaOrThrow(input.gameCode);
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw new UnauthorizedException("Invalid display session");
    }

    throw error;
  }

  if (
    meta.display.id !== input.displayId ||
    meta.display.sessionToken !== input.sessionToken
  ) {
    throw new UnauthorizedException("Invalid display session");
  }

  return {meta};
};

const verifyPlayerSession = async (input: PlayerSession) => {
  const player = await PlayerService.getPlayerRecord(
    input.gameCode,
    input.playerId,
  );
  if (!player || player.sessionToken !== input.sessionToken) {
    throw new UnauthorizedException("Invalid player session");
  }

  return {player};
};

export const verifyRoomSession = async (session: RoomSession) => {
  if (session.role === "display") {
    await verifyDisplaySession({
      gameCode: session.gameCode,
      displayId: session.roleId,
      sessionToken: session.sessionToken,
    });

    return session;
  }

  await verifyPlayerSession({
    gameCode: session.gameCode,
    playerId: session.roleId,
    sessionToken: session.sessionToken,
  });

  return session;
};

export const assertRoomSessionAvailable = async (
  session: RoomSession | null,
) => {
  if (!session) {
    return;
  }

  try {
    await verifyRoomSession(session);
  } catch (error) {
    if (isInvalidRoomSessionError(error)) {
      return;
    }

    throw error;
  }

  throw new ConflictException(
    `${getRoleConflictMessage(session.role)} in room ${session.gameCode}`,
  );
};

export const getActiveRoomClient = async (
  session: RoomSession | null,
): Promise<ActiveRoomClient> => {
  if (!session) {
    return activeRoomClientSchema.parse({role: "none"});
  }

  try {
    const verified = await verifyRoomSession(session);
    const meta = await RoomsService.getGameMetaOrThrow(verified.gameCode);
    return activeRoomClientSchema.parse({
      role: verified.role,
      gameCode: verified.gameCode,
      roomName: meta.roomName,
    });
  } catch (error) {
    if (isInvalidRoomSessionError(error)) {
      return activeRoomClientSchema.parse({role: "none"});
    }

    throw error;
  }
};

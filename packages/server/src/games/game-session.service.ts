import {
  activeRoomClientSchema,
  roomClientSchema,
  type ActiveRoomClient,
  type DisplaySession,
  type PlayerSession,
  type RoomClient,
  type RoomSession,
} from "@deckflix/shared";
import {ConflictException, UnauthorizedException} from "../common/errors";
import {getGameMetaOrThrow, getPlayerRecord} from "./game-redis.service";

const getRoleConflictMessage = (role: RoomSession["role"]) =>
  role === "display"
    ? "This browser already owns the display for this room"
    : "This browser is already joined to this room as a player";

export const verifyDisplaySession = async (input: DisplaySession) => {
  const meta = await getGameMetaOrThrow(input.gameCode);
  if (
    meta.display.id !== input.displayId ||
    meta.display.sessionToken !== input.sessionToken
  ) {
    throw new UnauthorizedException("Invalid display session");
  }

  return {meta};
};

export const verifyPlayerSession = async (input: PlayerSession) => {
  const player = await getPlayerRecord(input.gameCode, input.playerId);
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

export const assertRoomSessionAvailable = async (session: RoomSession | null) => {
  if (!session) {
    return;
  }

  try {
    await verifyRoomSession(session);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
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
    const meta = await getGameMetaOrThrow(verified.gameCode);
    return activeRoomClientSchema.parse({
      role: verified.role,
      gameCode: verified.gameCode,
      roomName: meta.roomName,
    });
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return activeRoomClientSchema.parse({role: "none"});
    }

    throw error;
  }
};

export const getRoomClient = async (input: {
  gameCode: string;
  session: RoomSession | null;
}): Promise<RoomClient> => {
  if (!input.session || input.session.gameCode !== input.gameCode) {
    return roomClientSchema.parse({role: "none"});
  }

  try {
    const verified = await verifyRoomSession(input.session);
    return roomClientSchema.parse({role: verified.role});
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return roomClientSchema.parse({role: "none"});
    }

    throw error;
  }
};

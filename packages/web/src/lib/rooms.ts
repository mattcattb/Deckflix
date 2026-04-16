import {parseRoomServerMessage, roomSessionSchema, type RoomSession} from "@deckflix/shared";
import { API_BASE_URL } from "./api";

const roomSessionKey = (roomCode: string) =>
  `movie-tinder:room-session:${roomCode.toUpperCase()}`;

export const saveRoomSession = (session: RoomSession) => {
  localStorage.setItem(roomSessionKey(session.roomCode), JSON.stringify(session));
};

export const getRoomSession = (roomCode: string): RoomSession | null => {
  const raw = localStorage.getItem(roomSessionKey(roomCode));
  if (!raw) return null;

  try {
    const parsed = roomSessionSchema.parse(JSON.parse(raw));
    return {
      roomCode: parsed.roomCode.toUpperCase(),
      memberId: parsed.memberId,
      sessionToken: parsed.sessionToken,
    };
  } catch {
    return null;
  }
};

export const createRoomWebSocketUrl = (session: RoomSession) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/rooms/${session.roomCode}/ws`, wsBase);
  url.searchParams.set("memberId", session.memberId);
  url.searchParams.set("sessionToken", session.sessionToken);
  return url.toString();
};

export {parseRoomServerMessage};

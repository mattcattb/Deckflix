import type {
  RoomClientMessage,
  RoomServerMessage,
  RoomSession,
} from "@matty-stack/shared";
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
    const parsed = JSON.parse(raw) as Partial<RoomSession>;
    if (!parsed.memberId || !parsed.sessionToken || !parsed.roomCode) {
      return null;
    }
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

export const parseRoomServerMessage = (raw: string): RoomServerMessage | null => {
  try {
    const parsed = JSON.parse(raw) as { type?: string };
    if (!parsed.type) return null;
    if (parsed.type === "room.snapshot") return parsed as RoomServerMessage;
    if (parsed.type === "room.match_found") return parsed as RoomServerMessage;
    if (parsed.type === "room.error") return parsed as RoomServerMessage;
    if (parsed.type === "pong") return parsed as RoomServerMessage;
    return null;
  } catch {
    return null;
  }
};

export const encodeRoomClientMessage = (message: RoomClientMessage) =>
  JSON.stringify(message);

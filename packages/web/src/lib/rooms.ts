import { API_BASE_URL } from "./api";
import {parseRoomServerMessage} from "@deckflix/shared";

export const createRoomWebSocketUrl = (roomCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/rooms/${roomCode.toUpperCase()}/ws`, wsBase);
  return url.toString();
};

export {parseRoomServerMessage};

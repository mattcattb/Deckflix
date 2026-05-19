import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {API_BASE_URL} from "../../lib/api";
import {getStoredRoomSessionToken} from "./room-session";

export const createActiveRoomWebSocketUrl = () => {
  const url = new URL(
    "/api/ws",
    API_BASE_URL.startsWith("/") ? window.location.origin : API_BASE_URL,
  );
  const useSecureProtocol =
    window.location.protocol === "https:" ||
    url.protocol === "https:" ||
    url.protocol === "wss:";
  url.protocol = useSecureProtocol ? "wss:" : "ws:";
  const token = getStoredRoomSessionToken();
  if (token) {
    url.searchParams.set("roomSessionToken", token);
  }
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};

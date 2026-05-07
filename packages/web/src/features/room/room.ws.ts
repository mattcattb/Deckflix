import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {API_BASE_URL} from "../../lib/api";

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
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};

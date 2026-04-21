import { API_BASE_URL } from "./api";
import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared";

export const createDisplayWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/games/${gameCode.toUpperCase()}/display/ws`, wsBase);
  return url.toString();
};

export const createPlayerWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/games/${gameCode.toUpperCase()}/players/ws`, wsBase);
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};

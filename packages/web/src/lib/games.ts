import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {API_BASE_URL, api, parseRpc} from "./api";

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

export const gameKeys = {
  activeClient: ["active-room-client"] as const,
  settingsDefaults: ["game-settings-defaults"] as const,
  movieGenres: (language = "en-US") => ["movie-genres", language] as const,
  roomClient: (gameCode: string) =>
    ["room-client", normalizeGameCode(gameCode)] as const,
  meta: (gameCode: string) =>
    ["game-meta", normalizeGameCode(gameCode)] as const,
  players: (gameCode: string) =>
    ["game-players", normalizeGameCode(gameCode)] as const,
  results: (gameCode: string) =>
    ["game-results", normalizeGameCode(gameCode)] as const,
  displayState: (gameCode: string) =>
    ["display-state", normalizeGameCode(gameCode)] as const,
  playerState: (gameCode: string) =>
    ["player-state", normalizeGameCode(gameCode)] as const,
};

export const getActiveRoomClient = () =>
  parseRpc(api.api.rooms.session.$get());

export const activeRoomClientQueryOptions = {
  queryKey: gameKeys.activeClient,
  queryFn: getActiveRoomClient,
};

export const createDisplayWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(
    `/api/rooms/${normalizeGameCode(gameCode)}/display/ws`,
    wsBase,
  );
  return url.toString();
};

export const createActiveDisplayWebSocketUrl = () => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL("/api/rooms/me/display/ws", wsBase);
  return url.toString();
};

export const createPlayerWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(
    `/api/rooms/${normalizeGameCode(gameCode)}/players/ws`,
    wsBase,
  );
  return url.toString();
};

export const createActivePlayerWebSocketUrl = () => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL("/api/rooms/me/player/ws", wsBase);
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};

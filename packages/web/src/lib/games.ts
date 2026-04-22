import {queryOptions} from "@tanstack/react-query";
import type {ActiveRoomClient} from "@deckflix/shared";
import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {API_BASE_URL, api, parseRpc} from "./api";

export const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

export const gameKeys = {
  activeClient: ["active-room-client"] as const,
  movieGenres: (language = "en-US") => ["movie-genres", language] as const,
  meta: (gameCode: string) => ["game-meta", normalizeGameCode(gameCode)] as const,
  players: (gameCode: string) =>
    ["game-players", normalizeGameCode(gameCode)] as const,
  results: (gameCode: string) =>
    ["game-results", normalizeGameCode(gameCode)] as const,
  displayState: (gameCode: string) =>
    ["display-state", normalizeGameCode(gameCode)] as const,
  playerState: (gameCode: string) =>
    ["player-state", normalizeGameCode(gameCode)] as const,
};

export const getActiveRoomClient = () => parseRpc(api.api.room.current.$get());

export const activeRoomClientQueryOptions = queryOptions({
  queryKey: gameKeys.activeClient,
  queryFn: getActiveRoomClient,
});

export const roomMetaQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.meta(gameCode),
    queryFn: () =>
      parseRpc(
        api.api.room[":gameCode"].meta.$get({
          param: {gameCode: normalizeGameCode(gameCode)},
        }),
      ),
  });

export const roomPlayersQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.players(gameCode),
    queryFn: () =>
      parseRpc(
        api.api.room[":gameCode"].players.$get({
          param: {gameCode: normalizeGameCode(gameCode)},
        }),
      ),
  });

export const activeRoomMetaQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.meta(gameCode),
    queryFn: () => parseRpc(api.api.room.meta.$get()),
  });

export const activeRoomPlayersQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.players(gameCode),
    queryFn: () => parseRpc(api.api.room.players.$get()),
  });

export const activeRoomResultsQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.results(gameCode),
    queryFn: () => parseRpc(api.api.room.results.$get()),
  });

export const activeDisplayStateQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.displayState(gameCode),
    queryFn: () => parseRpc(api.api.display.$get()),
  });

export const activePlayerStateQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: gameKeys.playerState(gameCode),
    queryFn: () => parseRpc(api.api.player.$get()),
  });

export const getActiveRoomPath = (client: ActiveRoomClient) => {
  if (client.role === "display") {
    return "/room" as const;
  }

  if (client.role === "player") {
    return "/play" as const;
  }

  return "/" as const;
};

export const createActiveDisplayWebSocketUrl = () => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL("/api/display/ws", wsBase);
  return url.toString();
};

export const createActivePlayerWebSocketUrl = () => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL("/api/player/ws", wsBase);
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};

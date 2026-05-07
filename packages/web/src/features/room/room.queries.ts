import {queryOptions} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";
import {normalizeGameCode} from "./room-session";

export const roomKeys = {
  meta: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "meta"] as const,
  players: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "players"] as const,
  results: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "results"] as const,
  matches: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "matches"] as const,
  recent: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "recent"] as const,
  stinkers: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "stinkers"] as const,
  playerState: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "player-state"] as const,
};

export const activeRoomMetaQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.meta(gameCode),
    queryFn: () => parseRpc(api.api.room.meta.$get()),
  });

export const activeRoomPlayersQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.players(gameCode),
    queryFn: () => parseRpc(api.api.room.players.$get()),
  });

export const activeRoomResultsQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.results(gameCode),
    queryFn: () => parseRpc(api.api.game.results.$get()),
  });

export const activeGameMatchesQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.matches(gameCode),
    queryFn: () => parseRpc(api.api.game.matches.$get()),
  });

export const activeGameRecentQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.recent(gameCode),
    queryFn: () => parseRpc(api.api.game.recent.$get()),
  });

export const activeGameStinkersQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.stinkers(gameCode),
    queryFn: () => parseRpc(api.api.game.stinkers.$get()),
  });

export const activePlayerStateQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.playerState(gameCode),
    queryFn: () => parseRpc(api.api.game.player.$get()),
  });

import {queryOptions} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";
import {normalizeGameCode} from "./room-session";

const LIVE_ROOM_STALE_TIME_MS = 15_000;

export const roomKeys = {
  meta: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "meta"] as const,
  players: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "players"] as const,
  matches: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "matches"] as const,
  recent: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "recent"] as const,
  stinkers: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "stinkers"] as const,
  player: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "player"] as const,
  playerDeck: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "player-deck"] as const,
  finale: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "finale"] as const,
};

export const activeRoomMetaQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.meta(gameCode),
    queryFn: () => parseRpc(api.api.room.meta.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activeRoomPlayersQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.players(gameCode),
    queryFn: () => parseRpc(api.api.room.players.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activeGameMatchesQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.matches(gameCode),
    queryFn: () => parseRpc(api.api.game.matches.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activeGameRecentQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.recent(gameCode),
    queryFn: () => parseRpc(api.api.game.recent.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activeGameStinkersQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.stinkers(gameCode),
    queryFn: () => parseRpc(api.api.game.stinkers.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activePlayerRoomQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.player(gameCode),
    queryFn: () => parseRpc(api.api.game.player.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activePlayerDeckQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.playerDeck(gameCode),
    queryFn: () => parseRpc(api.api.game.deck.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

export const activeFinaleQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.finale(gameCode),
    queryFn: () => parseRpc(api.api.game.finale.$get()),
    staleTime: LIVE_ROOM_STALE_TIME_MS,
  });

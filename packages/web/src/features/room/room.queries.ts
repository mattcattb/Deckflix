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
  displayState: (gameCode: string) =>
    ["room", normalizeGameCode(gameCode), "display-state"] as const,
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

export const activeDisplayStateQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.displayState(gameCode),
    queryFn: () => parseRpc(api.api.game.display.$get()),
  });

export const activePlayerStateQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: roomKeys.playerState(gameCode),
    queryFn: () => parseRpc(api.api.game.player.$get()),
  });

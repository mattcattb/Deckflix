import {queryOptions} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";
import {normalizeGameCode} from "../room/room-session";

const LOBBY_PREFERENCES_STALE_TIME_MS = 15_000;

export const preferenceKeys = {
  roomSettings: (gameCode: string) =>
    ["preferences", normalizeGameCode(gameCode), "room-settings"] as const,
  gamePreferences: (gameCode: string) =>
    ["preferences", normalizeGameCode(gameCode), "game-preferences"] as const,
};

export const activeRoomSettingsQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: preferenceKeys.roomSettings(gameCode),
    queryFn: () => parseRpc(api.api.room.settings.$get()),
    staleTime: LOBBY_PREFERENCES_STALE_TIME_MS,
  });

export const activeGamePreferencesQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: preferenceKeys.gamePreferences(gameCode),
    queryFn: () => parseRpc(api.api.game.preferences.$get()),
    staleTime: LOBBY_PREFERENCES_STALE_TIME_MS,
  });

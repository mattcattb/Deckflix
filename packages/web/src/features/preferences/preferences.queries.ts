import {queryOptions} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";
import {normalizeGameCode} from "../room/room-session";

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
  });

export const activeGamePreferencesQueryOptions = (gameCode: string) =>
  queryOptions({
    queryKey: preferenceKeys.gamePreferences(gameCode),
    queryFn: () => parseRpc(api.api.game.preferences.$get()),
  });

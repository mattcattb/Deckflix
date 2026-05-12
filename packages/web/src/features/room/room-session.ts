import {queryOptions, type QueryClient} from "@tanstack/react-query";
import {
  encodeRoomSessionToken,
  GAME_CODE_LENGTH,
  type ActiveRoomClient,
  type DisplaySession,
  type PlayerSession,
  type RoomSession,
} from "@deckflix/shared";
import {api, hasRpcErrorCode, parseRpc} from "../../lib/api";

const ROOM_SESSION_TOKEN_STORAGE_KEY = "deckflix_room_session_token";

export const normalizeGameCode = (gameCode: string) =>
  gameCode
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, GAME_CODE_LENGTH);

export const activeRoomSessionKeys = {
  activeClient: ["active-room-client"] as const,
};

const getActiveRoomClient = () => parseRpc(api.api.room.current.$get());

const canUseBrowserStorage = () => typeof window !== "undefined";

export const getStoredRoomSessionToken = () =>
  canUseBrowserStorage()
    ? window.localStorage.getItem(ROOM_SESSION_TOKEN_STORAGE_KEY)
    : null;

const storeRoomSessionToken = (session: RoomSession) => {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(
    ROOM_SESSION_TOKEN_STORAGE_KEY,
    encodeRoomSessionToken(session),
  );
};

export const storeDisplaySessionToken = (session: DisplaySession) => {
  storeRoomSessionToken({
    gameCode: session.gameCode,
    role: "display",
    roleId: session.displayId,
    sessionToken: session.sessionToken,
  });
};

export const storePlayerSessionToken = (session: PlayerSession) => {
  storeRoomSessionToken({
    gameCode: session.gameCode,
    role: "player",
    roleId: session.playerId,
    sessionToken: session.sessionToken,
  });
};

export const clearStoredRoomSessionToken = () => {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(ROOM_SESSION_TOKEN_STORAGE_KEY);
};

export const activeRoomClientQueryOptions = queryOptions({
  queryKey: activeRoomSessionKeys.activeClient,
  queryFn: getActiveRoomClient,
});

export const isMissingRoomSessionError = (error: unknown) =>
  hasRpcErrorCode(error, "NOT_FOUND", "UNAUTHORIZED");

export const clearActiveRoomSession = async (
  queryClient: QueryClient,
  gameCode?: string,
) => {
  await parseRpc(api.api.room.current.$delete()).catch(() => undefined);
  clearStoredRoomSessionToken();
  queryClient.setQueryData<ActiveRoomClient>(
    activeRoomSessionKeys.activeClient,
    {role: "none"},
  );

  if (!gameCode) {
    return;
  }

  const normalized = normalizeGameCode(gameCode);
  queryClient.removeQueries({queryKey: ["room", normalized]});
  queryClient.removeQueries({queryKey: ["preferences", normalized]});
};

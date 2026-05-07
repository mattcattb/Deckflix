import {queryOptions, type QueryClient} from "@tanstack/react-query";
import {GAME_CODE_LENGTH, type ActiveRoomClient} from "@deckflix/shared";
import {api, hasRpcErrorCode, parseRpc} from "../../lib/api";

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

import {queryOptions, type QueryClient} from "@tanstack/react-query";
import {GAME_CODE_LENGTH, type ActiveRoomClient} from "@deckflix/shared";
import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {API_BASE_URL, api, hasRpcErrorCode, parseRpc} from "./api";

export const normalizeGameCode = (gameCode: string) =>
  gameCode.replace(/[^A-Za-z0-9]/g, "").trim().toUpperCase().slice(0, GAME_CODE_LENGTH);

export const gameKeys = {
  activeClient: ["active-room-client"] as const,
  movieGenres: (language = "en-US") => ["movie-genres", language] as const,
  movieDetails: (movieId: string, language = "en-US", region = "US") =>
    ["movie-details", movieId, language, region] as const,
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

export const isMissingRoomSessionError = (error: unknown) =>
  hasRpcErrorCode(error, "NOT_FOUND", "UNAUTHORIZED");

export const clearActiveRoomSession = async (
  queryClient: QueryClient,
  gameCode?: string,
) => {
  await parseRpc(api.api.room.current.$delete()).catch(() => undefined);
  queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
    role: "none",
  });

  if (!gameCode) {
    return;
  }

  queryClient.removeQueries({queryKey: gameKeys.meta(gameCode), exact: true});
  queryClient.removeQueries({queryKey: gameKeys.players(gameCode), exact: true});
  queryClient.removeQueries({queryKey: gameKeys.results(gameCode), exact: true});
  queryClient.removeQueries({
    queryKey: gameKeys.displayState(gameCode),
    exact: true,
  });
  queryClient.removeQueries({
    queryKey: gameKeys.playerState(gameCode),
    exact: true,
  });
};

export const activeRoomClientQueryOptions = queryOptions({
  queryKey: gameKeys.activeClient,
  queryFn: getActiveRoomClient,
});

const ACTIVE_ROOM_CLIENT_SETTLE_TIMEOUT_MS = 1_500;
const ACTIVE_ROOM_CLIENT_SETTLE_INTERVAL_MS = 75;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export const waitForActiveRoomClient = async (queryClient: QueryClient) => {
  const deadline = Date.now() + ACTIVE_ROOM_CLIENT_SETTLE_TIMEOUT_MS;
  let activeClient = await queryClient.fetchQuery(activeRoomClientQueryOptions);

  while (activeClient.role === "none" && Date.now() < deadline) {
    await sleep(ACTIVE_ROOM_CLIENT_SETTLE_INTERVAL_MS);
    activeClient = await queryClient.fetchQuery(activeRoomClientQueryOptions);
  }

  return activeClient;
};

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

const createWebSocketUrl = (pathname: "/api/display/ws" | "/api/player/ws") => {
  const url = new URL(
    pathname,
    API_BASE_URL.startsWith("/") ? window.location.origin : API_BASE_URL,
  );
  const useSecureProtocol =
    window.location.protocol === "https:" ||
    url.protocol === "https:" ||
    url.protocol === "wss:";
  url.protocol = useSecureProtocol ? "wss:" : "ws:";
  return url.toString();
};

export const createActiveDisplayWebSocketUrl = () =>
  createWebSocketUrl("/api/display/ws");

export const createActivePlayerWebSocketUrl = () =>
  createWebSocketUrl("/api/player/ws");

export {parseDisplayServerMessage, parsePlayerServerMessage};

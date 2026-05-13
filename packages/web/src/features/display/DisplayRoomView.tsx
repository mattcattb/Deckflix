import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {Outlet, useLocation, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {
  ActiveRoomClient,
  GameMeta,
  GamePlayerPresence,
  GamePreferences,
  GameSettings,
  DisplayServerMessage,
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  roomKeys,
} from "../room/room.queries";
import {
  clearActiveRoomSession,
  clearStoredRoomSessionToken,
  activeRoomSessionKeys,
  isMissingRoomSessionError,
} from "../room/room-session";
import {
  createActiveRoomWebSocketUrl,
  parseDisplayServerMessage,
} from "../room/room.ws";
import {
  activeGamePreferencesQueryOptions,
  activeRoomSettingsQueryOptions,
  preferenceKeys,
} from "../preferences/preferences.queries";
import {movieGenresQueryOptions} from "../movie-catalog/movie-catalog.queries";
import {Eyebrow, ProfileAvatar} from "../../components/common";
import {Button} from "../../components/ui";
import {RoomUnavailable} from "../room/room-unavailable";
import {
  getDisplayRoomPath,
  getDisplayRoomViewMode,
} from "../room/room-view-modes";
import {
  RoomHeader,
  RoomScreenShell,
  RoomSidebarSection,
} from "../../components/layout";

type PlayerVoteFlashTone = "positive" | "negative";

type MovieGenre = {
  id: number;
  name: string;
};

type PlayerRailPlayer = Pick<
  GamePlayerPresence,
  "id" | "displayName" | "iconId"
>;

type DisplayRoomContextValue = {
  deleteRoom: () => void;
  deleteRoomPending: boolean;
  draftSettings: GameSettings;
  draftPreferences: GamePreferences;
  gameError: string | null;
  gameCode: string;
  lastDisplayMessage: DisplayServerMessage | null;
  meta: GameMeta;
  movieGenres: MovieGenre[];
  movieGenresError: string | null;
  players: GamePlayerPresence[];
  saveSettings: () => void;
  saveSettingsPending: boolean;
  setDraftPreferences: (preferences: GamePreferences) => void;
  setDraftSettings: (settings: GameSettings) => void;
  startGame: () => void;
  startGamePending: boolean;
  viewMode: ReturnType<typeof getDisplayRoomViewMode>;
};

const DisplayRoomContext = createContext<DisplayRoomContextValue | null>(null);

export const useDisplayRoom = () => {
  const context = useContext(DisplayRoomContext);
  if (!context) {
    throw new Error("Display room context is not available");
  }

  return context;
};

export function DisplayRoomShell({gameCode}: {gameCode: string}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const didClearSessionRef = useRef(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [draftSettings, setDraftSettings] = useState<GameSettings | null>(null);
  const [draftPreferences, setDraftPreferences] =
    useState<GamePreferences | null>(null);
  const [lastDisplayMessage, setLastDisplayMessage] =
    useState<DisplayServerMessage | null>(null);
  const [playerVoteFlashById, setPlayerVoteFlashById] = useState<
    Record<string, PlayerVoteFlashTone>
  >({});
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const settingsQuery = useQuery(activeRoomSettingsQueryOptions(gameCode));
  const preferencesQuery = useQuery(activeGamePreferencesQueryOptions(gameCode));
  const movieGenresQuery = useQuery(movieGenresQueryOptions());
  const movieGenresError = movieGenresQuery.error
    ? movieGenresQuery.error instanceof Error
      ? movieGenresQuery.error.message
      : "Unable to load genres"
    : null;
  const refetchMeta = metaQuery.refetch;
  const refetchPlayers = playersQuery.refetch;
  const resetRoomSession = useCallback(() => {
    if (didClearSessionRef.current) {
      return;
    }

    didClearSessionRef.current = true;
    void clearActiveRoomSession(queryClient, gameCode).finally(() => {
      navigate({to: "/", replace: true});
    });
  }, [gameCode, navigate, queryClient]);

  useEffect(() => {
    if (settingsQuery.data) {
      setDraftSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (preferencesQuery.data) {
      setDraftPreferences(preferencesQuery.data);
    }
  }, [preferencesQuery.data]);

  useEffect(() => {
    const roomError =
      metaQuery.error ??
      playersQuery.error ??
      settingsQuery.error ??
      preferencesQuery.error;
    if (roomError && isMissingRoomSessionError(roomError)) {
      resetRoomSession();
    }
  }, [
    metaQuery.error,
    playersQuery.error,
    preferencesQuery.error,
    resetRoomSession,
    settingsQuery.error,
  ]);

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const [meta, preferences] = await Promise.all([
        parseRpc(
          api.api.room.settings.$patch({
            json: draftSettings ?? {},
          }),
        ),
        parseRpc(
          api.api.game.preferences.$patch({
            json: draftPreferences ?? {},
          }),
        ),
      ]);

      return {meta, preferences};
    },
    onSuccess: ({meta, preferences}) => {
      queryClient.setQueryData<GameMeta>(roomKeys.meta(gameCode), meta);
      queryClient.setQueryData<GameSettings>(
        preferenceKeys.roomSettings(gameCode),
        meta.settings,
      );
      queryClient.setQueryData<GamePreferences>(
        preferenceKeys.gamePreferences(gameCode),
        preferences,
      );
      setGameError(null);
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to save settings",
      );
    },
  });

  const startGameMutation = useMutation({
    mutationFn: async () => parseRpc(api.api.room.start.$post()),
    onSuccess: () => {
      setGameError(null);
      void metaQuery.refetch();
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to start game",
      );
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async () => parseRpc(api.api.room.end.$post()),
    onSuccess: () => {
      clearStoredRoomSessionToken();
      queryClient.setQueryData<ActiveRoomClient>(
        activeRoomSessionKeys.activeClient,
        {role: "none"},
      );
      navigate({to: "/", replace: true});
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to end room",
      );
    },
  });

  const kickPlayerMutation = useMutation({
    mutationFn: async (playerId: string) =>
      parseRpc(
        api.api.room.players[":playerId"].$delete({
          param: {playerId},
        }),
      ),
    onSuccess: () => {
      setGameError(null);
      void refetchMeta();
      void refetchPlayers();
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to remove player",
      );
    },
  });

  useEffect(() => {
    const socket = new WebSocket(createActiveRoomWebSocketUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      setGameError(null);
    };

    socket.onclose = (event) => {
      if (event.code === 4001) {
        resetRoomSession();
        return;
      }

      if (event.reason) {
        setGameError(`Display socket closed: ${event.reason}`);
      }
    };

    socket.onerror = () => {
      setGameError("Display socket error");
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const message = parseDisplayServerMessage(event.data);
      if (!message) {
        return;
      }

      setLastDisplayMessage(message);

      if (message.type === "room.started") {
        void refetchMeta();
        return;
      }

      if (message.type === "room.status_changed") {
        void refetchMeta();
        return;
      }

      if (message.type === "room.deleted") {
        resetRoomSession();
        return;
      }

      if (message.type === "player.joined") {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (
        message.type === "player.left" ||
        message.type === "player.kicked" ||
        message.type === "player.updated"
      ) {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (
        message.type === "player.connected" ||
        message.type === "player.disconnected"
      ) {
        void refetchPlayers();
        return;
      }

      if (message.type === "game.match_found") {
        return;
      }

      if (message.type === "game.vote_recorded") {
        const tone =
          message.choice === "like" || message.choice === "super_like"
            ? "positive"
            : "negative";
        setPlayerVoteFlashById((current) => ({
          ...current,
          [message.playerId]: tone,
        }));
        window.setTimeout(() => {
          setPlayerVoteFlashById((current) => {
            if (current[message.playerId] !== tone) {
              return current;
            }

            const next = {...current};
            delete next[message.playerId];
            return next;
          });
        }, 650);
        return;
      }

      if (message.type === "socket.error") {
        setGameError(message.payload.message);
      }
    };

    return () => {
      if (
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN
      ) {
        socket.close();
      }

      socketRef.current = null;
    };
  }, [refetchMeta, refetchPlayers, resetRoomSession]);

  useEffect(() => {
    if (!metaQuery.data) {
      return;
    }

    const nextPath = getDisplayRoomPath(metaQuery.data.summary.status);
    if (location.pathname !== nextPath) {
      navigate({to: nextPath, replace: true});
    }
  }, [location.pathname, metaQuery.data, navigate]);

  if (
    metaQuery.isLoading ||
    playersQuery.isLoading ||
    settingsQuery.isLoading ||
    preferencesQuery.isLoading ||
    !draftSettings ||
    !draftPreferences
  ) {
    return null;
  }

  if (
    metaQuery.error ||
    playersQuery.error ||
    settingsQuery.error ||
    preferencesQuery.error ||
    !metaQuery.data ||
    !playersQuery.data
  ) {
    if (
      isMissingRoomSessionError(metaQuery.error) ||
      isMissingRoomSessionError(playersQuery.error) ||
      isMissingRoomSessionError(settingsQuery.error) ||
      isMissingRoomSessionError(preferencesQuery.error)
    ) {
      return null;
    }

    return (
      <RoomUnavailable
        message={
          settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : preferencesQuery.error instanceof Error
              ? preferencesQuery.error.message
              : metaQuery.error instanceof Error
                ? metaQuery.error.message
                : playersQuery.error instanceof Error
                  ? playersQuery.error.message
                  : "This room is not available."
        }
      />
    );
  }

  const viewMode = getDisplayRoomViewMode(metaQuery.data.summary.status);
  const contextValue: DisplayRoomContextValue = {
    deleteRoom: () => deleteRoomMutation.mutate(),
    deleteRoomPending: deleteRoomMutation.isPending,
    draftPreferences,
    draftSettings,
    gameCode,
    gameError,
    lastDisplayMessage,
    meta: metaQuery.data,
    movieGenres: movieGenresQuery.data?.items ?? [],
    movieGenresError,
    players: playersQuery.data.players,
    saveSettings: () => settingsMutation.mutate(),
    saveSettingsPending: settingsMutation.isPending,
    setDraftPreferences,
    setDraftSettings,
    startGame: () => startGameMutation.mutate(),
    startGamePending: startGameMutation.isPending,
    viewMode,
  };

  return (
    <DisplayRoomContext.Provider value={contextValue}>
      <>
        <RoomScreenShell
          error={gameError}
          header={
            <RoomHeader
              brandTo="/room"
              title={
                <div className="min-w-0 truncate text-xs font-medium text-white sm:text-sm">
                  {metaQuery.data.summary.roomName || "Deckflix Room"}
                </div>
              }
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  title="End room"
                  onClick={() => deleteRoomMutation.mutate()}
                  disabled={deleteRoomMutation.isPending}>
                  <span className="hidden sm:inline">End room</span>
                  <span className="sm:hidden">End</span>
                </Button>
              }
            />
          }
          sidebar={
            <RoomSidebarSection title="Who's Playing">
              {playersQuery.data.players.map((player) => {
                return (
                  <PlayerSidebarRow
                    key={player.id}
                    player={player}
                    canKick={viewMode === "lobby"}
                    flashTone={playerVoteFlashById[player.id]}
                    kickPending={
                      kickPlayerMutation.isPending &&
                      kickPlayerMutation.variables === player.id
                    }
                    onKick={(playerId) => kickPlayerMutation.mutate(playerId)}
                  />
                );
              })}
            </RoomSidebarSection>
          }
          mobileSidebar={
            <div className="mb-5 space-y-3 lg:hidden">
              <Eyebrow className="text-white/45">Who&apos;s Playing</Eyebrow>
              <div className="flex gap-4 overflow-x-auto border-b border-white/10 pb-3">
                {playersQuery.data.players.map((player) => {
                  return (
                    <div key={player.id} className="w-56 shrink-0">
                      <PlayerSidebarRow
                        player={player}
                        canKick={viewMode === "lobby"}
                        flashTone={playerVoteFlashById[player.id]}
                        kickPending={
                          kickPlayerMutation.isPending &&
                          kickPlayerMutation.variables === player.id
                        }
                        onKick={(playerId) => kickPlayerMutation.mutate(playerId)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          }>
          <Outlet />
        </RoomScreenShell>
      </>
    </DisplayRoomContext.Provider>
  );
}

function PlayerSidebarRow({
  canKick,
  player,
  flashTone,
  kickPending,
  onKick,
}: {
  canKick?: boolean;
  player: PlayerRailPlayer;
  flashTone?: PlayerVoteFlashTone;
  kickPending?: boolean;
  onKick?: (playerId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 py-3 transition">
      <ProfileAvatar
        className={
          flashTone === "positive"
            ? "player-vote-flash-positive"
            : flashTone === "negative"
              ? "player-vote-flash-negative"
              : ""
        }
        colorKey={player.displayName}
        displayName={player.displayName}
        iconKey={player.iconId}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">
          {player.displayName}
        </div>
      </div>
      {canKick ? (
        <Button
          aria-label={`Remove ${player.displayName}`}
          className="h-8 w-8 px-0 text-base"
          disabled={kickPending}
          onClick={() => onKick?.(player.id)}
          size="sm"
          title="Remove player"
          variant="ghost">
          x
        </Button>
      ) : null}
    </div>
  );
}

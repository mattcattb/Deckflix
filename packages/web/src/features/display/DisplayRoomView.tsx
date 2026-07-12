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
  MovieWatchProvider,
  DisplayServerMessage,
} from "@deckflix/shared";
import {api, getRpcErrorMessage, parseRpc} from "../../lib/api";
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
import {parseDisplayServerMessage} from "../room/room.ws";
import {
  activeGamePreferencesQueryOptions,
  activeRoomSettingsQueryOptions,
  preferenceKeys,
} from "../preferences/preferences.queries";
import {
  movieGenresQueryOptions,
  movieWatchProvidersQueryOptions,
} from "../movie-catalog/movie-catalog.queries";
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
  SocketStatusDot,
} from "../../components/layout";
import {useRoomWebSocket} from "../room/use-room-websocket";
import {captureProductEvent} from "../../lib/telemetry";

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
  movieGenresLoading: boolean;
  movieGenresError: string | null;
  movieProviders: MovieWatchProvider[];
  movieProvidersLoading: boolean;
  movieProvidersError: string | null;
  players: GamePlayerPresence[];
  settingsSaveStatus: "idle" | "pending" | "saving" | "saved";
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
  const didClearSessionRef = useRef(false);
  const lastSavedSettingsRef = useRef<GameSettings | null>(null);
  const lastSavedPreferencesRef = useRef<GamePreferences | null>(null);
  const savedStatusTimeoutRef = useRef<number | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [draftSettings, setDraftSettings] = useState<GameSettings | null>(null);
  const [draftPreferences, setDraftPreferences] =
    useState<GamePreferences | null>(null);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<
    DisplayRoomContextValue["settingsSaveStatus"]
  >("idle");
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
    ? getRpcErrorMessage(movieGenresQuery.error, "Unable to load genres")
    : null;
  const movieWatchProvidersQuery = useQuery(
    movieWatchProvidersQueryOptions(
      draftPreferences?.watchRegion ?? "US",
      "en-US",
    ),
  );
  const movieWatchProvidersError = movieWatchProvidersQuery.error
    ? getRpcErrorMessage(
        movieWatchProvidersQuery.error,
        "Unable to load watch providers",
      )
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
      lastSavedSettingsRef.current = settingsQuery.data;
      setDraftSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (preferencesQuery.data) {
      lastSavedPreferencesRef.current = preferencesQuery.data;
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
    mutationFn: async (input: {
      settings: GameSettings;
      preferences: GamePreferences;
    }) => {
      const [meta, preferences] = await Promise.all([
        parseRpc(
          api.api.room.settings.$patch({
            json: input.settings,
          }),
        ),
        parseRpc(
          api.api.game.preferences.$patch({
            json: input.preferences,
          }),
        ),
      ]);

      return {meta, preferences};
    },
    onMutate: () => {
      setSettingsSaveStatus("saving");
    },
    onSuccess: ({meta, preferences}) => {
      lastSavedSettingsRef.current = meta.settings;
      lastSavedPreferencesRef.current = preferences;
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
      setSettingsSaveStatus("saved");
      if (savedStatusTimeoutRef.current) {
        window.clearTimeout(savedStatusTimeoutRef.current);
      }
      savedStatusTimeoutRef.current = window.setTimeout(() => {
        setSettingsSaveStatus("idle");
        savedStatusTimeoutRef.current = null;
      }, 1600);
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(getRpcErrorMessage(error, "Unable to save settings"));
      setSettingsSaveStatus("pending");
    },
  });

  const startGameMutation = useMutation({
    mutationFn: async () => {
      if (
        draftSettings &&
        draftPreferences &&
        hasUnsavedSettings(draftSettings, draftPreferences, {
          settings: lastSavedSettingsRef.current,
          preferences: lastSavedPreferencesRef.current,
        })
      ) {
        const {meta, preferences} = await settingsMutation.mutateAsync({
          settings: draftSettings,
          preferences: draftPreferences,
        });
        lastSavedSettingsRef.current = meta.settings;
        lastSavedPreferencesRef.current = preferences;
      }

      return parseRpc(api.api.room.start.$post());
    },
    onSuccess: () => {
      captureProductEvent("game_started", {
        playerCount: playersQuery.data?.players.length ?? 0,
      });
      setGameError(null);
      void metaQuery.refetch();
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(getRpcErrorMessage(error, "Unable to start game"));
    },
  });

  useEffect(() => {
    return () => {
      if (savedStatusTimeoutRef.current) {
        window.clearTimeout(savedStatusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!draftSettings || !draftPreferences) {
      return;
    }

    if (
      !hasUnsavedSettings(draftSettings, draftPreferences, {
        settings: lastSavedSettingsRef.current,
        preferences: lastSavedPreferencesRef.current,
      })
    ) {
      if (settingsSaveStatus === "pending") {
        setSettingsSaveStatus("idle");
      }
      return;
    }

    if (settingsMutation.isPending || startGameMutation.isPending) {
      return;
    }

    setSettingsSaveStatus("pending");
    const timeout = window.setTimeout(() => {
      settingsMutation.mutate({
        settings: draftSettings,
        preferences: draftPreferences,
      });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    draftPreferences,
    draftSettings,
    settingsMutation,
    settingsMutation.isPending,
    settingsSaveStatus,
    startGameMutation.isPending,
  ]);

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

      setGameError(getRpcErrorMessage(error, "Unable to end room"));
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

      setGameError(getRpcErrorMessage(error, "Unable to remove player"));
    },
  });

  const socketStatus = useRoomWebSocket({
    label: "Display",
    onInvalidSession: resetRoomSession,
    onOpen: useCallback(() => {
      setGameError(null);
      void refetchMeta();
      void refetchPlayers();
    }, [refetchMeta, refetchPlayers]),
    onMessage: useCallback(
      (event: MessageEvent<string>) => {
        const message = parseDisplayServerMessage(event.data);
        if (!message) {
          return;
        }

        setLastDisplayMessage(message);

        if (message.type === "room.started") {
          void refetchMeta();
          return;
        }

        if (message.type === "room.completed") {
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
      },
      [refetchMeta, refetchPlayers, resetRoomSession],
    ),
  });

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
        message={getRpcErrorMessage(
          settingsQuery.error ??
            preferencesQuery.error ??
            metaQuery.error ??
            playersQuery.error,
          "This room is not available.",
        )}
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
    movieGenresLoading: movieGenresQuery.isLoading,
    movieGenresError,
    movieProviders: movieWatchProvidersQuery.data?.items ?? [],
    movieProvidersLoading: movieWatchProvidersQuery.isLoading,
    movieProvidersError: movieWatchProvidersError,
    players: playersQuery.data.players,
    settingsSaveStatus,
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
                <>
                  <SocketStatusDot status={socketStatus} />
                  <Button
                    variant="ghost"
                    size="sm"
                    title="End room"
                    onClick={() => deleteRoomMutation.mutate()}
                    disabled={deleteRoomMutation.isPending}>
                    <span className="hidden sm:inline">End room</span>
                    <span className="sm:hidden">End</span>
                  </Button>
                </>
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

function hasUnsavedSettings(
  settings: GameSettings,
  preferences: GamePreferences,
  saved: {
    settings: GameSettings | null;
    preferences: GamePreferences | null;
  },
) {
  if (!saved.settings || !saved.preferences) {
    return false;
  }

  return (
    JSON.stringify(settings) !== JSON.stringify(saved.settings) ||
    JSON.stringify(preferences) !== JSON.stringify(saved.preferences)
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
    <div className="flex min-w-0 flex-col items-center gap-2 text-center transition">
      <div className="relative">
        <ProfileAvatar
          avatarKey={player.iconId}
          className={
            flashTone === "positive"
              ? "player-vote-flash-positive"
              : flashTone === "negative"
                ? "player-vote-flash-negative"
                : ""
          }
          displayName={player.displayName}
          size="lg"
        />
        {canKick ? (
          <Button
            aria-label={`Remove ${player.displayName}`}
            className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-black/75 px-0 text-xs"
            disabled={kickPending}
            onClick={() => onKick?.(player.id)}
            size="sm"
            title="Remove player"
            variant="ghost">
            x
          </Button>
        ) : null}
      </div>
      <div className="max-w-full truncate text-center text-sm font-medium text-white/70">
        {player.displayName}
      </div>
    </div>
  );
}

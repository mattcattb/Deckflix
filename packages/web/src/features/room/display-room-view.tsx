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
  DisplayGameState,
  GameMeta,
  GamePlayerPresence,
  GamePreferences,
  GameSettings,
  MovieCandidate,
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activeDisplayStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  roomKeys,
} from "./room.queries";
import {
  clearActiveRoomSession,
  activeRoomSessionKeys,
  isMissingRoomSessionError,
} from "./room-session";
import {
  createActiveRoomWebSocketUrl,
  parseDisplayServerMessage,
} from "./room.ws";
import {
  activeGamePreferencesQueryOptions,
  activeRoomSettingsQueryOptions,
  preferenceKeys,
} from "../preferences/preferences.queries";
import {movieGenresQueryOptions} from "../movie-catalog/movie-catalog.queries";
import {Eyebrow, ProfileAvatar} from "../../components/common";
import {
  Button,
} from "../../components/ui";
import {GamePreferencesSection} from "../preferences/game-preferences-section";
import {RoomUnavailable} from "./room-unavailable";
import {
  getDisplayRoomPath,
  getDisplayRoomViewMode,
} from "./room-view-modes";
import {
  DisplayBrowseView,
  MatchFoundOverlay,
  type DisplayBoard,
  type DisplayBoardItem,
} from "./display-browse-view";
import {
  RoomHeader,
  RoomScreenShell,
  RoomSidebarSection,
} from "./room-screen-shell";

type PlayerVoteFlashTone = "positive" | "negative";

type MatchReveal = {
  id: string;
  movie: MovieCandidate;
};

type MovieGenre = {
  id: number;
  name: string;
};

type PlayerRailPlayer = Pick<GamePlayerPresence, "id" | "displayName">;

type DisplayRoomContextValue = {
  board: DisplayBoard;
  deleteRoom: () => void;
  deleteRoomPending: boolean;
  draftSettings: GameSettings;
  draftPreferences: GamePreferences;
  gameError: string | null;
  gameCode: string;
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
  state: DisplayGameState;
  viewMode: ReturnType<typeof getDisplayRoomViewMode>;
};

const DisplayRoomContext = createContext<DisplayRoomContextValue | null>(null);

const getTimestamp = (value: string | null | undefined) =>
  value ? Date.parse(value) : 0;

const sortByLastActivity = (left: DisplayBoardItem, right: DisplayBoardItem) =>
  getTimestamp(right.votes.lastActivityAt) - getTimestamp(left.votes.lastActivityAt);

const sortByRecentHistory = (left: DisplayBoardItem, right: DisplayBoardItem) =>
  right.votes.totalVotes - left.votes.totalVotes || sortByLastActivity(left, right);

const sortByMatchedAt = (left: DisplayBoardItem, right: DisplayBoardItem) =>
  getTimestamp(right.votes.matchedAt) - getTimestamp(left.votes.matchedAt) ||
  sortByLastActivity(left, right);

const getBoardSections = (state: DisplayGameState | null): DisplayBoard => {
  if (!state) {
    return {
      matches: [],
      recentHistory: [],
      stinkers: [],
    };
  }

  const rejectedIds = new Set(state.results.rejectedMovieIds);
  const voteSummaryByMovieId = new Map(
    state.results.voteSummary.map((entry) => [entry.movieId, entry] as const),
  );
  const boardItems = state.queue
    .map((item) => {
      const votes = voteSummaryByMovieId.get(item.movie.id);
      if (!votes || votes.totalVotes === 0 || !votes.lastActivityAt) {
        return null;
      }

      if (votes.matched) {
        return {
          movie: item.movie,
          votes,
          outcome: "match" as const,
        };
      }

      return {
        movie: item.movie,
        votes,
        outcome: rejectedIds.has(votes.movieId) ? "rejected" as const : "active" as const,
      };
    })
    .filter((item): item is DisplayBoardItem => Boolean(item));

  const matches = boardItems.filter((item) => item.outcome === "match").sort(sortByMatchedAt);
  const recentHistory = [...boardItems].sort(sortByRecentHistory);
  const stinkers = boardItems
    .filter((item) => item.outcome === "rejected")
    .sort(sortByLastActivity);

  return {
    matches,
    recentHistory,
    stinkers,
  };
};

const useDisplayRoom = () => {
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
  const [state, setState] = useState<DisplayGameState | null>(null);
  const [draftSettings, setDraftSettings] = useState<GameSettings | null>(null);
  const [draftPreferences, setDraftPreferences] =
    useState<GamePreferences | null>(null);
  const [activeMatch, setActiveMatch] = useState<MatchReveal | null>(null);
  const [queuedMatchIds, setQueuedMatchIds] = useState<string[]>([]);
  const [playerVoteFlashById, setPlayerVoteFlashById] = useState<
    Record<string, PlayerVoteFlashTone>
  >({});
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const stateQuery = useQuery(activeDisplayStateQueryOptions(gameCode));
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
  const refetchState = stateQuery.refetch;
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
    if (stateQuery.data) {
      setState(stateQuery.data);
    }
  }, [stateQuery.data]);

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
      stateQuery.error ??
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
    stateQuery.error,
  ]);

  useEffect(() => {
    if (activeMatch || queuedMatchIds.length === 0) {
      return;
    }

    const nextMatchId = queuedMatchIds[0];
    const matchMovie =
      state?.queue.find((item) => item.movie.id === nextMatchId)?.movie ??
      stateQuery.data?.queue.find((item) => item.movie.id === nextMatchId)?.movie;

    if (!matchMovie) {
      setQueuedMatchIds((current) => current.slice(1));
      return;
    }

    setActiveMatch({
      id: nextMatchId,
      movie: matchMovie,
    });
    setQueuedMatchIds((current) => current.slice(1));
  }, [activeMatch, queuedMatchIds, state, stateQuery.data]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveMatch((current) =>
        current?.id === activeMatch.id ? null : current,
      );
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [activeMatch]);

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
      void stateQuery.refetch();
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

      if (message.type === "display.snapshot") {
        setState(message.payload);
        return;
      }

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

      if (message.type === "presence.player_joined") {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (message.type === "presence.player_left") {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (message.type === "swipe.match_found") {
        void refetchState();
        setQueuedMatchIds((current) =>
          current.includes(message.payload.movieId)
            ? current
            : [...current, message.payload.movieId],
        );
        return;
      }

      if (message.type === "swipe.vote_recorded") {
        void refetchState();
        const tone =
          message.payload.choice === "like" || message.payload.choice === "super_like"
            ? "positive"
            : "negative";
        setPlayerVoteFlashById((current) => ({
          ...current,
          [message.payload.playerId]: tone,
        }));
        window.setTimeout(() => {
          setPlayerVoteFlashById((current) => {
            if (current[message.payload.playerId] !== tone) {
              return current;
            }

            const next = {...current};
            delete next[message.payload.playerId];
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
  }, [refetchMeta, refetchPlayers, refetchState, resetRoomSession]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const nextPath = getDisplayRoomPath(state.summary.status);
    if (location.pathname !== nextPath) {
      navigate({to: nextPath, replace: true});
    }
  }, [location.pathname, navigate, state]);

  if (
    metaQuery.isLoading ||
    playersQuery.isLoading ||
    stateQuery.isLoading ||
    settingsQuery.isLoading ||
    preferencesQuery.isLoading ||
    !state ||
    !draftSettings ||
    !draftPreferences
  ) {
    return null;
  }

  if (
    metaQuery.error ||
    playersQuery.error ||
    stateQuery.error ||
    settingsQuery.error ||
    preferencesQuery.error ||
    !metaQuery.data ||
    !playersQuery.data
  ) {
    if (
      isMissingRoomSessionError(metaQuery.error) ||
      isMissingRoomSessionError(playersQuery.error) ||
      isMissingRoomSessionError(stateQuery.error) ||
      isMissingRoomSessionError(settingsQuery.error) ||
      isMissingRoomSessionError(preferencesQuery.error)
    ) {
      return null;
    }

    return (
      <RoomUnavailable
        message={
          stateQuery.error instanceof Error
            ? stateQuery.error.message
            : settingsQuery.error instanceof Error
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

  const board = getBoardSections(state);
  const viewMode = getDisplayRoomViewMode(state.summary.status);
  const contextValue: DisplayRoomContextValue = {
    board,
    deleteRoom: () => deleteRoomMutation.mutate(),
    deleteRoomPending: deleteRoomMutation.isPending,
    draftPreferences,
    draftSettings,
    gameCode,
    gameError,
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
    state,
    viewMode,
  };

  return (
    <DisplayRoomContext.Provider value={contextValue}>
      <>
        {activeMatch && location.pathname === "/room/live" ? (
          <MatchFoundOverlay movie={activeMatch.movie} />
        ) : null}

        <RoomScreenShell
          error={gameError}
          header={
            <RoomHeader
              brandTo="/room"
              title={
                <div className="min-w-0 truncate text-xs font-medium text-white sm:text-sm">
                  {metaQuery.data.summary.roomName || "Movie night"}
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
                    flashTone={playerVoteFlashById[player.id]}
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
                        flashTone={playerVoteFlashById[player.id]}
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

export function DisplayRoomLobbyView() {
  const {
    draftSettings,
    draftPreferences,
    meta,
    movieGenres,
    movieGenresError,
    players,
    saveSettings,
    saveSettingsPending,
    setDraftPreferences,
    setDraftSettings,
    startGame,
    startGamePending,
  } = useDisplayRoom();

  return (
    <section className="max-w-5xl">
      <div className="border-b border-white/10 pb-4">
        <Eyebrow className="text-white/45">
          Room code
        </Eyebrow>
        <button
          type="button"
          className="mt-2 font-mono text-3xl font-bold tracking-[0.24em] text-primary transition hover:text-[hsl(357_92%_55%)]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(meta.summary.code);
            } catch {
              // noop
            }
          }}>
          {meta.summary.code}
        </button>
      </div>
      <div className="py-6">
        <GamePreferencesSection
          settings={draftSettings}
          preferences={draftPreferences}
          onChange={setDraftSettings}
          onPreferencesChange={setDraftPreferences}
          movieGenres={movieGenres}
          movieGenresError={movieGenresError}
        />
      </div>
      <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
        <Button
          variant="secondary"
          size="sm"
          onClick={saveSettings}
          disabled={saveSettingsPending}>
          {saveSettingsPending ? "Saving..." : "Save"}
        </Button>
        <Button
          effect="glow"
          onClick={startGame}
          disabled={startGamePending || players.length < 2}>
          {startGamePending ? "Starting..." : "Start game"}
        </Button>
      </div>
    </section>
  );
}

export function DisplayRoomLiveView() {
  const {board} = useDisplayRoom();
  return <DisplayBrowseView board={board} mode="live" />;
}

export function DisplayRoomResultsView() {
  const {board} = useDisplayRoom();
  return <DisplayBrowseView board={board} mode="results" />;
}

function PlayerSidebarRow({
  player,
  flashTone,
}: {
  player: PlayerRailPlayer;
  flashTone?: PlayerVoteFlashTone;
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
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">
          {player.displayName}
        </div>
      </div>
    </div>
  );
}

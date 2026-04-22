import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {
  ActiveRoomClient,
  DisplayGameState,
  GameMeta,
  GamePlayerPresence,
  GameSettings,
  GameVoteSummary,
  MovieCandidate,
  MovieDetails,
  MovieSummary,
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activeDisplayStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  clearActiveRoomSession,
  createActiveDisplayWebSocketUrl,
  gameKeys,
  isMissingRoomSessionError,
  parseDisplayServerMessage,
} from "../../lib/games";
import {
  Button,
} from "../../components/ui";
import {GameSettingsSection} from "../../components/games/game-settings-section";
import {RoomUnavailable} from "./room-unavailable";
import {
  getDisplayRoomPath,
  getDisplayRoomViewMode,
} from "./room-view-modes";

type DisplayBoardItem = {
  movie: MovieCandidate;
  votes: GameVoteSummary;
  outcome: "match" | "rejected" | "active";
};

type RailKey = "matches" | "recentHistory" | "stinkers";
type PlayerVoteFlashTone = "positive" | "negative";

type DisplayBoard = {
  matches: DisplayBoardItem[];
  recentHistory: DisplayBoardItem[];
  stinkers: DisplayBoardItem[];
};

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
  gameError: string | null;
  gameCode: string;
  meta: GameMeta;
  movieGenres: MovieGenre[];
  movieGenresError: string | null;
  players: GamePlayerPresence[];
  saveSettings: () => void;
  saveSettingsPending: boolean;
  setDraftSettings: (settings: GameSettings) => void;
  startGame: () => void;
  startGamePending: boolean;
  state: DisplayGameState;
  viewMode: ReturnType<typeof getDisplayRoomViewMode>;
};

const PLAYER_TILE_GRADIENTS = [
  "from-red-500 to-rose-700",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-fuchsia-400 to-purple-600",
  "from-pink-400 to-rose-600",
] as const;

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
  const [activeMatch, setActiveMatch] = useState<MatchReveal | null>(null);
  const [queuedMatchIds, setQueuedMatchIds] = useState<string[]>([]);
  const [playerVoteFlashById, setPlayerVoteFlashById] = useState<
    Record<string, PlayerVoteFlashTone>
  >({});
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const stateQuery = useQuery(activeDisplayStateQueryOptions(gameCode));
  const movieGenresQuery = useQuery({
    queryKey: gameKeys.movieGenres(),
    queryFn: () =>
      parseRpc(
        api.api.settings.game["movie-genres"].$get({
          query: {language: "en-US"},
        }),
      ),
    staleTime: 1000 * 60 * 60,
  });
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
    if (stateQuery.data) {
      setState(stateQuery.data);
    }
  }, [stateQuery.data]);

  useEffect(() => {
    if (metaQuery.data) {
      setDraftSettings(metaQuery.data.settings);
    }
  }, [metaQuery.data]);

  useEffect(() => {
    const roomError =
      metaQuery.error ?? playersQuery.error ?? stateQuery.error;
    if (roomError && isMissingRoomSessionError(roomError)) {
      resetRoomSession();
    }
  }, [metaQuery.error, playersQuery.error, resetRoomSession, stateQuery.error]);

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
    mutationFn: async () =>
      parseRpc(
        api.api.display.settings.$patch({
          json: draftSettings ?? {},
        }),
      ),
    onSuccess: (meta) => {
      queryClient.setQueryData<GameMeta>(gameKeys.meta(gameCode), meta);
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
    mutationFn: async () => parseRpc(api.api.display.start.$post()),
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
    mutationFn: async () => parseRpc(api.api.display.end.$post()),
    onSuccess: () => {
      queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
        role: "none",
      });
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
    const socket = new WebSocket(createActiveDisplayWebSocketUrl());
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
        setQueuedMatchIds((current) =>
          current.includes(message.payload.movieId)
            ? current
            : [...current, message.payload.movieId],
        );
        return;
      }

      if (message.type === "swipe.vote_recorded") {
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
  }, [refetchMeta, refetchPlayers, resetRoomSession]);

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
    !state ||
    !draftSettings
  ) {
    return null;
  }

  if (
    metaQuery.error ||
    playersQuery.error ||
    stateQuery.error ||
    !metaQuery.data ||
    !playersQuery.data
  ) {
    if (
      isMissingRoomSessionError(metaQuery.error) ||
      isMissingRoomSessionError(playersQuery.error) ||
      isMissingRoomSessionError(stateQuery.error)
    ) {
      return null;
    }

    return (
      <RoomUnavailable
        message={
          stateQuery.error instanceof Error
            ? stateQuery.error.message
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
    draftSettings,
    gameCode,
    gameError,
    meta: metaQuery.data,
    movieGenres: movieGenresQuery.data?.items ?? [],
    movieGenresError,
    players: playersQuery.data.players,
    saveSettings: () => settingsMutation.mutate(),
    saveSettingsPending: settingsMutation.isPending,
    setDraftSettings,
    startGame: () => startGameMutation.mutate(),
    startGamePending: startGameMutation.isPending,
    state,
    viewMode,
  };

  return (
    <DisplayRoomContext.Provider value={contextValue}>
      <div className="flex min-h-screen w-full flex-col bg-black text-white">
        {activeMatch && location.pathname === "/room/live" ? (
          <MatchFoundOverlay movie={activeMatch.movie} />
        ) : null}

        <header className="sticky top-0 z-30 border-b border-white/10 bg-black/92 backdrop-blur-md">
          <div className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                to="/room"
                className="netflix-wordmark text-2xl uppercase tracking-[0.08em] sm:text-3xl">
                Deck<span className="flame-text">flix</span>
              </Link>
              <div className="h-8 w-px bg-white/10" />
              <div className="min-w-0 truncate text-xs font-medium text-white sm:text-sm">
                {metaQuery.data.summary.roomName || "Movie night"}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                title="End room"
                onClick={() => deleteRoomMutation.mutate()}
                disabled={deleteRoomMutation.isPending}>
                <span className="hidden sm:inline">End room</span>
                <span className="sm:hidden">End</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex w-full flex-1 gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-24 h-[calc(100vh-7.5rem)] border-r border-white/10 pr-6">
              <div className="pb-5">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                  Who&apos;s Playing
                </div>
              </div>
              <div className="h-[calc(100%-5.75rem)] overflow-y-auto">
                {playersQuery.data.players.map((player) => {
                  return (
                    <PlayerSidebarRow
                      key={player.id}
                      player={player}
                      flashTone={playerVoteFlashById[player.id]}
                    />
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1600px]">
              <div className="mb-5 space-y-3 lg:hidden">
                <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                  Who&apos;s Playing
                </div>
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
              {gameError ? (
                <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {gameError}
                </div>
              ) : null}
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </DisplayRoomContext.Provider>
  );
}

export function DisplayRoomLobbyView() {
  const {
    draftSettings,
    meta,
    movieGenres,
    movieGenresError,
    players,
    saveSettings,
    saveSettingsPending,
    setDraftSettings,
    startGame,
    startGamePending,
  } = useDisplayRoom();

  return (
    <section className="max-w-5xl">
      <div className="border-b border-white/10 pb-4">
        <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
          Room code
        </div>
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
        <GameSettingsSection
          settings={draftSettings}
          onChange={setDraftSettings}
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
  return <DisplayBrowseView mode="live" />;
}

export function DisplayRoomResultsView() {
  return <DisplayBrowseView mode="results" />;
}

function DisplayBrowseView({mode}: {mode: "live" | "results"}) {
  const {board} = useDisplayRoom();
  const isResults = mode === "results";
  const seenByRailRef = useRef<Record<RailKey, Set<string>>>({
    matches: new Set(),
    recentHistory: new Set(),
    stinkers: new Set(),
  });
  const [newCardIdsByRail, setNewCardIdsByRail] = useState<Record<RailKey, string[]>>({
    matches: [],
    recentHistory: [],
    stinkers: [],
  });
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const movieById = useMemo(
    () =>
      new Map(
        [...board.matches, ...board.recentHistory, ...board.stinkers].map((item) => [
          item.movie.id,
          item.movie,
        ] as const),
      ),
    [board.matches, board.recentHistory, board.stinkers],
  );
  const selectedMovie = selectedMovieId ? movieById.get(selectedMovieId) ?? null : null;

  useEffect(() => {
    const rails: Record<RailKey, DisplayBoardItem[]> = {
      matches: board.matches,
      recentHistory: board.recentHistory,
      stinkers: board.stinkers,
    };
    const nextNewIds: Record<RailKey, string[]> = {
      matches: [],
      recentHistory: [],
      stinkers: [],
    };

    (Object.keys(rails) as RailKey[]).forEach((railKey) => {
      const seen = seenByRailRef.current[railKey];
      const ids = rails[railKey].map((item) => item.movie.id);
      if (seen.size === 0) {
        ids.forEach((id) => seen.add(id));
        return;
      }

      nextNewIds[railKey] = ids.filter((id) => !seen.has(id));
      ids.forEach((id) => seen.add(id));
    });

    if (
      nextNewIds.matches.length === 0 &&
      nextNewIds.recentHistory.length === 0 &&
      nextNewIds.stinkers.length === 0
    ) {
      return;
    }

    setNewCardIdsByRail(nextNewIds);
    const timeout = window.setTimeout(() => {
      setNewCardIdsByRail({
        matches: [],
        recentHistory: [],
        stinkers: [],
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [board.matches, board.recentHistory, board.stinkers]);

  return (
    <div className="space-y-6">
      <MovieDetailsOverlay
        movie={selectedMovie}
        movieId={selectedMovieId}
        onClose={() => setSelectedMovieId(null)}
        onSelectMovie={setSelectedMovieId}
      />

      <BrowseRail
        title={isResults ? "Final Matches" : "Matches"}
        items={board.matches}
        newCardIds={newCardIdsByRail.matches}
        tone="match"
        onSelectMovie={setSelectedMovieId}
        interactive
      />

      <BrowseRail
        title="Recent History"
        items={board.recentHistory}
        newCardIds={newCardIdsByRail.recentHistory}
        tone="mixed"
        onSelectMovie={setSelectedMovieId}
        interactive={false}
      />

      <BrowseRail
        title="Stinkers"
        items={board.stinkers}
        newCardIds={newCardIdsByRail.stinkers}
        tone="stinker"
        onSelectMovie={setSelectedMovieId}
        interactive
      />
    </div>
  );
}

function BrowseRail({
  title,
  items,
  newCardIds,
  tone,
  onSelectMovie,
  interactive,
}: {
  title: string;
  items: DisplayBoardItem[];
  newCardIds: string[];
  tone: "match" | "mixed" | "stinker";
  onSelectMovie: (movieId: string) => void;
  interactive: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-medium font-display text-white">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => (
          <BrowseRailCard
            key={`${title}-${item.movie.id}`}
            item={item}
            isNew={newCardIds.includes(item.movie.id)}
            tone={tone}
            interactive={interactive}
            onSelect={() => onSelectMovie(item.movie.id)}
          />
        ))}
      </div>
    </section>
  );
}

function BrowseRailCard({
  item,
  isNew,
  tone,
  interactive,
  onSelect,
}: {
  item: DisplayBoardItem;
  isNew: boolean;
  tone: "match" | "mixed" | "stinker";
  interactive: boolean;
  onSelect: () => void;
}) {
  const cardTone =
    item.outcome === "match"
      ? "match"
      : item.outcome === "rejected"
        ? "stinker"
        : "active";
  const positiveVotes = item.votes.like + item.votes.superLike;
  const negativeVotes = item.votes.dislike + item.votes.skip + item.votes.maybe;
  const accentTone = tone === "mixed" ? cardTone : tone;
  const frameClass =
    accentTone === "match"
      ? "ring-1 ring-swipe-like/35"
      : accentTone === "stinker"
        ? "ring-1 ring-danger/35"
        : "ring-1 ring-white/20";
  const badgeClass =
    accentTone === "match"
      ? "border-swipe-like/35 bg-swipe-like/15 text-swipe-like"
      : accentTone === "stinker"
        ? "border-danger/35 bg-danger/15 text-danger"
        : "border-white/20 bg-black/45 text-white";
  const voteCount =
    item.outcome === "match"
      ? positiveVotes
      : item.outcome === "rejected"
        ? negativeVotes
        : item.votes.totalVotes;
  const badgeText =
    item.outcome === "active"
      ? `${item.votes.totalVotes} swipe${item.votes.totalVotes === 1 ? "" : "s"}`
      : interactive
        ? "Click for details"
        : item.outcome === "match"
          ? "Match"
          : "Rejected";

  const content = (
    <>
      <img
        src={item.movie.posterUrl}
        alt={item.movie.title}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-3">
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass}`}>
          {item.outcome === "match" ? (
            <HeartIcon size={12} />
          ) : item.outcome === "rejected" ? (
            <XIcon size={12} />
          ) : (
            <ActivityIcon size={12} />
          )}
          <span>{voteCount}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="line-clamp-2 text-xl font-medium leading-tight font-display text-white">
          {item.movie.title}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-white/55">
          {badgeText}
        </div>
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div
        className={`relative h-56 w-[14rem] shrink-0 overflow-hidden rounded-md bg-[#181818] ${frameClass} ${
          isNew ? "rail-card-enter" : ""
        }`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative h-56 w-[14rem] shrink-0 overflow-hidden rounded-md bg-[#181818] transition-transform duration-200 hover:scale-[1.02] ${frameClass} ${
        isNew ? "rail-card-enter" : ""
      }`}>
      {content}
    </button>
  );
}

function MovieDetailsOverlay({
  movie,
  movieId,
  onClose,
  onSelectMovie,
}: {
  movie: MovieCandidate | null;
  movieId: string | null;
  onClose: () => void;
  onSelectMovie: (movieId: string) => void;
}) {
  const detailsQuery = useQuery({
    queryKey: movieId
      ? gameKeys.movieDetails(movieId, "en-US", "US")
      : ["movie-details", "idle"],
    queryFn: () =>
      parseRpc(
        api.api.movies[":movieId"].$get({
          param: {movieId: movieId!},
          query: {
            language: "en-US",
            region: "US",
          },
        }),
      ),
    enabled: Boolean(movieId),
    staleTime: 1000 * 60 * 60,
  });

  useEffect(() => {
    if (!movieId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [movieId, onClose]);

  if (!movieId) {
    return null;
  }

  const details = detailsQuery.data ?? toFallbackMovieDetails(movie);
  const people = [...details.directors, ...details.writers, ...details.cast].slice(0, 12);
  const hasProviders =
    details.watchProviders.stream.length > 0 ||
    details.watchProviders.rent.length > 0 ||
    details.watchProviders.buy.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-6"
      onClick={onClose}>
      <div
        className="relative h-[92vh] w-full overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#0b0b0d] shadow-[0_40px_120px_rgba(0,0,0,0.65)] sm:h-[88vh] sm:max-w-6xl sm:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/72 transition hover:bg-black/80"
          onClick={onClose}>
          Close
        </button>

        <div className="h-full overflow-y-auto">
          <div className="relative min-h-[18rem] overflow-hidden border-b border-white/10">
            {details.backdropUrl ? (
              <img
                src={details.backdropUrl}
                alt={details.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,6,0.18),rgba(4,4,6,0.82)_72%,rgba(4,4,6,1))]" />
            <div className="relative flex flex-col gap-6 px-5 pb-6 pt-20 sm:px-8 lg:flex-row lg:items-end lg:px-10">
              <img
                src={details.posterUrl}
                alt={details.title}
                className="h-64 w-44 shrink-0 rounded-[1.4rem] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
              />
              <div className="max-w-3xl">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/50">
                  TMDB movie details
                </div>
                <h2 className="mt-3 text-4xl font-semibold leading-none text-white text-balance font-display sm:text-5xl">
                  {details.title}
                </h2>
                {details.tagline ? (
                  <p className="mt-3 text-base italic text-white/72 sm:text-lg">
                    {details.tagline}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/74">
                  <span>{details.year}</span>
                  {details.runtimeMinutes ? (
                    <>
                      <span className="text-white/20">&bull;</span>
                      <span>{formatRuntime(details.runtimeMinutes)}</span>
                    </>
                  ) : null}
                  {details.contentRating ? (
                    <>
                      <span className="text-white/20">&bull;</span>
                      <span>{details.contentRating}</span>
                    </>
                  ) : null}
                  <span className="text-white/20">&bull;</span>
                  <span>{details.rating.toFixed(1)} TMDB</span>
                  {details.voteCount ? (
                    <span className="text-white/50">
                      ({formatCompactNumber(details.voteCount)} votes)
                    </span>
                  ) : null}
                </div>
                {details.genres.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {details.genres.map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-medium text-white/80">
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)] lg:px-10">
            <div className="space-y-8">
              <section className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                  Overview
                </div>
                <p className="max-w-3xl text-sm leading-7 text-white/74 sm:text-[15px]">
                  {details.overview || "No synopsis available yet."}
                </p>
                {details.keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {details.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/62">
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              {people.length > 0 ? (
                <section className="space-y-4">
                  <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                    People
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {people.map((person) => (
                      <div
                        key={`${person.id}-${person.role}`}
                        className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                        <div className="text-sm font-medium text-white">{person.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">
                          {person.role}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {hasProviders ? (
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                      Where To Watch
                    </div>
                    {details.watchProviders.link ? (
                      <a
                        href={details.watchProviders.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs uppercase tracking-[0.22em] text-primary transition hover:text-[hsl(357_92%_55%)]">
                        Open on JustWatch
                      </a>
                    ) : null}
                  </div>
                  <div className="space-y-4">
                    <ProviderRow label="Stream" items={details.watchProviders.stream} />
                    <ProviderRow label="Rent" items={details.watchProviders.rent} />
                    <ProviderRow label="Buy" items={details.watchProviders.buy} />
                  </div>
                </section>
              ) : null}

              {details.gallery.backdrops.length > 0 || details.gallery.posters.length > 0 ? (
                <section className="space-y-4">
                  <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                    Gallery
                  </div>
                  {details.gallery.backdrops.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {details.gallery.backdrops.slice(0, 8).map((imageUrl) => (
                        <img
                          key={imageUrl}
                          src={imageUrl}
                          alt={`${details.title} backdrop`}
                          className="h-36 w-64 shrink-0 rounded-2xl object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {details.gallery.posters.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {details.gallery.posters.slice(0, 8).map((imageUrl) => (
                        <img
                          key={imageUrl}
                          src={imageUrl}
                          alt={`${details.title} poster option`}
                          className="h-44 w-32 shrink-0 rounded-2xl object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {details.recommendations.length > 0 || details.similar.length > 0 ? (
                <section className="space-y-6">
                  <MovieSummaryRow
                    title="Recommendations"
                    items={details.recommendations}
                    onSelectMovie={onSelectMovie}
                  />
                  <MovieSummaryRow
                    title="Similar"
                    items={details.similar}
                    onSelectMovie={onSelectMovie}
                  />
                </section>
              ) : null}
            </div>

            <aside className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                Facts
              </div>
              <DetailFact label="Release">
                {details.releaseDate ? formatDate(details.releaseDate) : "Unknown"}
              </DetailFact>
              <DetailFact label="Status">{details.status || "Unknown"}</DetailFact>
              <DetailFact label="Original title">
                {details.originalTitle || details.title}
              </DetailFact>
              <DetailFact label="Language">
                {details.originalLanguage || "Unknown"}
              </DetailFact>
              <DetailFact label="Spoken languages">
                {joinList(details.spokenLanguages)}
              </DetailFact>
              <DetailFact label="Production countries">
                {joinList(details.productionCountries)}
              </DetailFact>
              <DetailFact label="Studios">
                {joinList(details.productionCompanies)}
              </DetailFact>
              <DetailFact label="Budget">
                {details.budget ? formatMoney(details.budget) : "Unknown"}
              </DetailFact>
              <DetailFact label="Revenue">
                {details.revenue ? formatMoney(details.revenue) : "Unknown"}
              </DetailFact>
              {details.belongsToCollection ? (
                <DetailFact label="Collection">
                  {details.belongsToCollection.name}
                </DetailFact>
              ) : null}
              {details.homepage ? (
                <DetailFact label="Homepage">
                  <a
                    href={details.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary transition hover:text-[hsl(357_92%_55%)]">
                    Visit site
                  </a>
                </DetailFact>
              ) : null}
              {details.imdbId ? (
                <DetailFact label="IMDb">
                  <a
                    href={`https://www.imdb.com/title/${details.imdbId}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary transition hover:text-[hsl(357_92%_55%)]">
                    {details.imdbId}
                  </a>
                </DetailFact>
              ) : null}
              {details.trailers.length > 0 ? (
                <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                    Videos
                  </div>
                  <div className="mt-3 space-y-2">
                    {details.trailers.map((video) => (
                      <a
                        key={video.id}
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-white/80 transition hover:border-white/16 hover:bg-black/35">
                        <div className="font-medium text-white">{video.name}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/45">
                          {video.type} on {video.site}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {detailsQuery.isLoading ? (
                <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/62">
                  Loading richer TMDB details...
                </div>
              ) : null}
              {detailsQuery.error ? (
                <div className="rounded-[1.5rem] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {detailsQuery.error instanceof Error
                    ? detailsQuery.error.message
                    : "Unable to load full movie details"}
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderRow({
  label,
  items,
}: {
  label: string;
  items: MovieDetails["watchProviders"]["stream"];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((provider) => (
          <div
            key={`${label}-${provider.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/78">
            {provider.logoUrl ? (
              <img
                src={provider.logoUrl}
                alt={provider.name}
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : null}
            <span>{provider.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MovieSummaryRow({
  title,
  items,
  onSelectMovie,
}: {
  title: string;
  items: MovieSummary[];
  onSelectMovie: (movieId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
        {title}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <button
            key={`${title}-${item.id}`}
            type="button"
            onClick={() => onSelectMovie(item.id)}
            className="group w-36 shrink-0 overflow-hidden rounded-[1.3rem] border border-white/8 bg-white/[0.03] text-left transition hover:scale-[1.02]">
            <img
              src={item.posterUrl}
              alt={item.title}
              className="h-52 w-full object-cover"
            />
            <div className="space-y-1 px-3 py-3">
              <div className="line-clamp-2 text-sm font-medium text-white">
                {item.title}
              </div>
              <div className="text-xs text-white/45">
                {item.year} • {item.rating.toFixed(1)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function DetailFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
        {label}
      </div>
      <div className="mt-1 text-sm leading-6 text-white/78">{children}</div>
    </div>
  );
}

function toFallbackMovieDetails(movie: MovieCandidate | null): MovieDetails {
  return {
    id: movie?.id ?? "",
    title: movie?.title ?? "Movie",
    year: movie?.year ?? 0,
    overview: movie?.overview ?? "",
    posterUrl: movie?.posterUrl ?? "",
    rating: movie?.rating ?? 0,
    backdropUrl: "",
    genres: [],
    spokenLanguages: [],
    productionCountries: [],
    productionCompanies: [],
    directors: [],
    writers: [],
    cast: [],
    keywords: [],
    trailers: [],
    gallery: {
      posters: [],
      backdrops: [],
      logos: [],
    },
    watchProviders: {
      region: "US",
      stream: [],
      rent: [],
      buy: [],
    },
    recommendations: [],
    similar: [],
  };
}

function formatRuntime(runtimeMinutes: number) {
  const hours = Math.floor(runtimeMinutes / 60);
  const minutes = runtimeMinutes % 60;
  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function joinList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "Unknown";
}

function MatchFoundOverlay({movie}: {movie: MovieCandidate}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/78 backdrop-blur-md">
      <div className="match-overlay-glow absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(357_92%_47%_/_0.4),_transparent_38%),radial-gradient(circle_at_bottom,_hsl(145_65%_42%_/_0.24),_transparent_32%)]" />
      <div className="match-overlay-card relative mx-6 flex w-full max-w-4xl items-center gap-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.5)]">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="match-overlay-poster h-72 w-48 shrink-0 rounded-[1.5rem] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        />
        <div className="max-w-xl">
          <div className="match-overlay-badge inline-flex items-center rounded-full border border-swipe-like/35 bg-swipe-like/12 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-swipe-like">
            It&apos;s a match
          </div>
          <h2 className="match-overlay-title mt-5 text-5xl font-semibold leading-none text-white text-balance font-display">
            {movie.title}
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/74">
            <span>{movie.year}</span>
            <span className="text-white/20">&bull;</span>
            <span>{movie.rating.toFixed(1)} TMDB</span>
          </div>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/68">
            Everyone swiped right. Queue this one up.
          </p>
        </div>
      </div>
    </div>
  );
}

function HeartIcon({size = 14}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function XIcon({size = 14}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ActivityIcon({size = 14}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M3 12h4l2.5-5 4 10 2.5-5H21" />
    </svg>
  );
}

function PlayerSidebarRow({
  player,
  flashTone,
}: {
  player: PlayerRailPlayer;
  flashTone?: PlayerVoteFlashTone;
}) {
  const initial = player.displayName.trim().charAt(0).toUpperCase() || "?";
  const gradient =
    PLAYER_TILE_GRADIENTS[hashString(player.displayName) % PLAYER_TILE_GRADIENTS.length];

  return (
    <div className="flex items-center gap-3 border-b border-white/10 py-3 transition">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br ${gradient} text-lg font-semibold text-white ${
          flashTone === "positive"
            ? "player-vote-flash-positive"
            : flashTone === "negative"
              ? "player-vote-flash-negative"
              : ""
        }`}>
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">
          {player.displayName}
        </div>
      </div>
    </div>
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

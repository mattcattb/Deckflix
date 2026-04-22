import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
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
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activeDisplayStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  createActiveDisplayWebSocketUrl,
  gameKeys,
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
  outcome: "match" | "rejected";
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

type PlayerRailPlayer = Pick<
  GamePlayerPresence,
  "id" | "displayName" | "connectedAsPlayer"
>;

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
  progressByPlayerId: Map<
    string,
    DisplayGameState["playerProgress"][number]
  >;
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
      if (!votes || !votes.resolvedAt) {
        return null;
      }

      if (votes.matched) {
        return {
          movie: item.movie,
          votes,
          outcome: "match" as const,
        };
      }

      if (rejectedIds.has(votes.movieId)) {
        return {
          movie: item.movie,
          votes,
          outcome: "rejected" as const,
        };
      }

      return null;
    })
    .filter((item): item is DisplayBoardItem => Boolean(item));

  const matches = boardItems.filter((item) => item.outcome === "match").sort(sortByMatchedAt);
  const recentHistory = [...boardItems].sort(sortByLastActivity);
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
        queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
          role: "none",
        });
        navigate({to: "/", replace: true});
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
        void parseRpc(api.api.room.current.$delete()).catch(() => undefined);
        queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
          role: "none",
        });
        navigate({to: "/", replace: true});
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
  }, [navigate, queryClient, refetchMeta, refetchPlayers]);

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
  const progressByPlayerId = new Map(
    state.playerProgress.map((progress) => [progress.playerId, progress] as const),
  );
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
    progressByPlayerId,
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
                  const progress = progressByPlayerId.get(player.id);
                  return (
                    <PlayerSidebarRow
                      key={player.id}
                      player={player}
                      currentIndex={progress?.currentIndex ?? 0}
                      completed={progress?.completed ?? false}
                      queueSize={state.summary.queueSize}
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
                    const progress = progressByPlayerId.get(player.id);
                    return (
                      <div key={player.id} className="w-56 shrink-0">
                        <PlayerSidebarRow
                          player={player}
                          currentIndex={progress?.currentIndex ?? 0}
                          completed={progress?.completed ?? false}
                          queueSize={state.summary.queueSize}
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
      <BrowseRail
        title={isResults ? "Final Matches" : "Matches"}
        items={board.matches}
        newCardIds={newCardIdsByRail.matches}
        tone="match"
      />

      <BrowseRail
        title="Recent History"
        items={board.recentHistory}
        newCardIds={newCardIdsByRail.recentHistory}
        tone="mixed"
      />

      <BrowseRail
        title="Stinkers"
        items={board.stinkers}
        newCardIds={newCardIdsByRail.stinkers}
        tone="stinker"
      />
    </div>
  );
}

function BrowseRail({
  title,
  items,
  newCardIds,
  tone,
}: {
  title: string;
  items: DisplayBoardItem[];
  newCardIds: string[];
  tone: "match" | "mixed" | "stinker";
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
}: {
  item: DisplayBoardItem;
  isNew: boolean;
  tone: "match" | "mixed" | "stinker";
}) {
  const isMatch = item.outcome === "match";
  const positiveVotes = item.votes.like + item.votes.superLike;
  const negativeVotes = item.votes.dislike + item.votes.skip + item.votes.maybe;
  const accentTone =
    tone === "mixed" ? (isMatch ? "match" : "stinker") : tone;
  const frameClass =
    accentTone === "match"
      ? "ring-1 ring-swipe-like/35"
      : "ring-1 ring-danger/35";
  const badgeClass =
    accentTone === "match"
      ? "border-swipe-like/35 bg-swipe-like/15 text-swipe-like"
      : "border-danger/35 bg-danger/15 text-danger";

  return (
    <article
      className={`group relative h-56 w-[14rem] shrink-0 overflow-hidden rounded-md bg-[#181818] transition-transform duration-200 hover:scale-[1.02] ${frameClass} ${
        isNew ? "rail-card-enter" : ""
      }`}>
      <img
        src={item.movie.posterUrl}
        alt={item.movie.title}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-3">
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass}`}>
          {isMatch ? <HeartIcon size={12} /> : <XIcon size={12} />}
          <span>{isMatch ? positiveVotes : negativeVotes}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="line-clamp-2 text-xl font-medium leading-tight font-display text-white">
          {item.movie.title}
        </div>
      </div>
    </article>
  );
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

function PlayerSidebarRow({
  player,
  currentIndex,
  completed,
  queueSize,
  flashTone,
}: {
  player: PlayerRailPlayer;
  currentIndex: number;
  completed: boolean;
  queueSize: number;
  flashTone?: PlayerVoteFlashTone;
}) {
  const initial = player.displayName.trim().charAt(0).toUpperCase() || "?";
  const gradient =
    PLAYER_TILE_GRADIENTS[hashString(player.displayName) % PLAYER_TILE_GRADIENTS.length];
  const progressLabel = !player.connectedAsPlayer
    ? "Away"
    : completed
      ? "Finished"
      : `${Math.min(currentIndex, queueSize)}/${queueSize}`;

  return (
    <div
      className={`flex items-center gap-3 border-b border-white/10 py-3 transition ${
        player.connectedAsPlayer ? "" : "opacity-45"
      }`}>
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
        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/45">
          {progressLabel}
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

import {useEffect, useRef, useState} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
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
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui";
import {GameSettingsSection} from "../../components/games/game-settings-section";
import {RoomUnavailable} from "./room-unavailable";
import {getDisplayRoomViewMode} from "./room-view-modes";

type DisplayBoardItem = {
  movie: MovieCandidate;
  votes: GameVoteSummary;
  outcome: "match" | "rejected";
};

const PLAYER_TILE_GRADIENTS = [
  "from-red-500 to-rose-700",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-fuchsia-400 to-purple-600",
  "from-pink-400 to-rose-600",
] as const;

const getBoardSections = (state: DisplayGameState | null) => {
  if (!state) {
    return {
      matches: [] as DisplayBoardItem[],
      history: [] as DisplayBoardItem[],
    };
  }

  const rejectedIds = new Set(state.results.rejectedMovieIds);
  const boardItems = state.queue
    .map((item) => {
      const votes = state.results.voteSummary.find(
        (entry) => entry.movieId === item.movie.id,
      );
      if (!votes) {
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

  return {
    matches: boardItems.filter((item) => item.outcome === "match"),
    history: boardItems,
  };
};

export function DisplayRoomView({gameCode}: {gameCode: string}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [state, setState] = useState<DisplayGameState | null>(null);
  const [draftSettings, setDraftSettings] = useState<GameSettings | null>(null);
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

      if (message.type === "display.room_ended") {
        queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
          role: "none",
        });
        navigate({to: "/", replace: true});
        return;
      }

      if (message.type === "display.player_joined") {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (message.type === "display.player_left") {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (message.type === "display.error") {
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

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-gradient-to-b from-black via-black/95 to-black/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link
            to="/room"
            className="netflix-wordmark text-2xl uppercase tracking-[0.08em]">
            Deck<span className="flame-text">flix</span>
          </Link>
          <div className="flex items-center gap-3">
            <StatusBadge label={viewMode} />
            <Button
              variant="ghost"
              size="sm"
              title="End room"
              onClick={() => deleteRoomMutation.mutate()}
              disabled={deleteRoomMutation.isPending}>
              End room
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-5 px-5 py-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-5">
          <section className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Join code
                </div>
                <button
                  type="button"
                  className="mt-2 font-mono text-3xl font-bold tracking-[0.28em] text-foreground transition hover:text-accent sm:text-4xl"
                  title="Copy code"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(state.summary.code);
                    } catch {
                      setGameError("Unable to copy game code");
                    }
                  }}>
                  {state.summary.code}
                </button>
                <p className="mt-2 text-sm text-muted-foreground">
                  {metaQuery.data.summary.roomName || "Tap code to copy"}
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground">
                <StatPill value={state.summary.playerCount} label="players" />
                <StatPill value={board.matches.length} label="matches" />
                <StatPill value={board.history.length} label="resolved" />
              </div>
            </div>
          </section>

          {gameError ? (
            <div className="rounded-2xl border border-swipe-nope/20 bg-swipe-nope/10 px-4 py-3 text-sm text-swipe-nope">
              {gameError}
            </div>
          ) : null}

          {viewMode === "lobby" ? (
            <Card className="rounded-[1.75rem] border-white/[0.08] bg-white/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <GameSettingsSection
                  settings={draftSettings}
                  onChange={setDraftSettings}
                  movieGenres={movieGenresQuery.data?.items ?? []}
                  movieGenresError={movieGenresError}
                />
              </CardContent>
              <CardFooter className="justify-end gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => settingsMutation.mutate()}
                  disabled={settingsMutation.isPending}>
                  {settingsMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  effect="glow"
                  onClick={() => startGameMutation.mutate()}
                  disabled={
                    startGameMutation.isPending ||
                    playersQuery.data.players.length < 2
                  }>
                  {startGameMutation.isPending ? "Starting..." : "Start game"}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <>
              <section className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-swipe-like">
                      <HeartIcon size={16} />
                      <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                        {viewMode === "completed" ? "Final matches" : "Matches"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cleaner winners grid with the extra columns reclaimed from split decisions.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    {board.matches.length}
                  </div>
                </div>

                {board.matches.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {board.matches.map(({movie, votes}) => (
                      <DisplayMovieCard
                        key={movie.id}
                        movie={movie}
                        votes={votes}
                        outcome="match"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No matches yet</p>
                )}
              </section>

              <section className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <XCircleIcon size={16} />
                      <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                        Swipe history
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Small horizontal strip for resolved titles.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                    {board.history.length}
                  </div>
                </div>

                {board.history.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {board.history.map(({movie, votes, outcome}) => (
                      <DisplayMovieCard
                        key={movie.id}
                        movie={movie}
                        votes={votes}
                        outcome={outcome}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing resolved yet
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="mx-auto w-[19rem] max-w-full rounded-[1.75rem] border border-white/[0.08] bg-[#111] p-5 xl:sticky xl:top-24 xl:mx-0 xl:h-fit">
          <div className="mb-5 text-center">
            <div className="font-display text-3xl tracking-[0.04em] text-white">
              Who&apos;s Playing?
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {playersQuery.data.players.map((player) => {
              const progress = progressByPlayerId.get(player.id);
              return (
                <PlayerRailTile
                  key={player.id}
                  player={player}
                  currentIndex={progress?.currentIndex ?? 0}
                  completed={progress?.completed ?? false}
                  queueSize={state.summary.queueSize}
                />
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DisplayMovieCard({
  movie,
  votes,
  outcome,
  compact = false,
}: {
  movie: MovieCandidate;
  votes: GameVoteSummary;
  outcome: "match" | "rejected";
  compact?: boolean;
}) {
  const positiveVotes = votes.like + votes.superLike;
  const negativeVotes = votes.dislike + votes.skip;

  return (
    <article
      className={`overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.04] ${
        compact ? "w-40 shrink-0" : ""
      }`}>
      <div className="relative">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className={`w-full object-cover ${compact ? "h-40" : "h-60"}`}
        />
        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
          {outcome === "match" ? "Match" : "Out"}
        </div>
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent ${
            compact ? "px-3 pb-3 pt-10" : "px-4 pb-4 pt-14"
          }`}>
          <div className={`font-display leading-tight text-white ${compact ? "text-lg" : "text-xl"}`}>
            {movie.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
            <span>{movie.year}</span>
            <span className="text-white/30">&bull;</span>
            <span>{movie.rating.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className={`flex flex-wrap gap-2 ${compact ? "px-3 py-3 text-[11px]" : "px-4 py-3 text-xs"}`}>
        <VotePill label="Like" value={positiveVotes} tone="like" />
        <VotePill label="Nope" value={negativeVotes} tone="nope" />
        {votes.maybe > 0 ? <VotePill label="Maybe" value={votes.maybe} tone="maybe" /> : null}
      </div>
    </article>
  );
}

function PlayerRailTile({
  player,
  currentIndex,
  completed,
  queueSize,
}: {
  player: GamePlayerPresence;
  currentIndex: number;
  completed: boolean;
  queueSize: number;
}) {
  const initial = player.displayName.trim().charAt(0).toUpperCase() || "?";
  const gradient =
    PLAYER_TILE_GRADIENTS[hashString(player.displayName) % PLAYER_TILE_GRADIENTS.length];
  const tileTone = completed
    ? "ring-2 ring-swipe-like/70 shadow-[0_0_28px_hsl(145_65%_42%/0.16)]"
    : currentIndex > 0
      ? "ring-2 ring-primary/60 shadow-[0_0_24px_hsl(357_92%_47%/0.14)]"
      : "ring-1 ring-white/10";

  return (
    <div
      className={`group flex flex-col items-center gap-2 text-center transition-opacity ${
        player.connectedAsPlayer ? "" : "opacity-45"
      }`}>
      <div
        className={`flex h-18 w-18 items-center justify-center rounded-md bg-gradient-to-br ${gradient} font-display text-4xl text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform duration-150 group-hover:scale-[1.03] ${tileTone}`}>
        {initial}
      </div>

      <div className="w-full">
        <div className="truncate text-sm font-medium text-zinc-300 group-hover:text-white">
          {player.displayName}
        </div>
        {!player.connectedAsPlayer ? (
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Away
          </div>
        ) : completed ? (
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-swipe-like">
            Finished
          </div>
        ) : (
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {Math.min(currentIndex, queueSize)}/{queueSize}
          </div>
        )}
      </div>
    </div>
  );
}

function VotePill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "like" | "nope" | "maybe";
}) {
  const toneClass =
    tone === "like"
      ? "bg-success/15 text-success"
      : tone === "nope"
        ? "bg-danger/15 text-danger"
        : "bg-warning/15 text-warning";

  return (
    <span className={`rounded-full px-2.5 py-1 ${toneClass}`}>
      {value} {label}
    </span>
  );
}

function StatPill({value, label}: {value: number; label: string}) {
  return (
    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1">
      {value} {label}
    </span>
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function StatusBadge({label}: {label: string}) {
  return (
    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      {label}
    </span>
  );
}

function HeartIcon({size = 20}: {size?: number}) {
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

function XCircleIcon({size = 20}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

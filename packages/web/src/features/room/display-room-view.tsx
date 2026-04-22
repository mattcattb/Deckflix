import {useEffect, useRef, useState, type ReactNode} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {
  ActiveRoomClient,
  DisplayGameState,
  GamePlayerPresence,
  GameMeta,
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
import {MovieCard} from "../../components/games/movie-card";
import {GameSettingsSection} from "../../components/games/game-settings-section";
import {RoomUnavailable} from "./room-unavailable";
import {getDisplayRoomViewMode} from "./room-view-modes";

type DisplayBoardItem = {
  movie: MovieCandidate;
  votes: GameVoteSummary;
};

const getBoardSections = (state: DisplayGameState | null) => {
  if (!state) {
    return {
      matches: [] as DisplayBoardItem[],
      rejected: [] as DisplayBoardItem[],
      splitDecisions: [] as DisplayBoardItem[],
    };
  }

  const boardItems = state.queue
    .map((item) => {
      const votes = state.results.voteSummary.find(
        (entry) => entry.movieId === item.movie.id,
      );
      return votes ? {movie: item.movie, votes} : null;
    })
    .filter((item): item is DisplayBoardItem => Boolean(item));

  return {
    matches: boardItems.filter(({votes}) => votes.matched),
    rejected: boardItems.filter(({votes}) =>
      state.results.rejectedMovieIds.includes(votes.movieId),
    ),
    splitDecisions: boardItems.filter(
      ({votes}) =>
        votes.totalVotes > 0 &&
        votes.like + votes.superLike > 0 &&
        votes.dislike + votes.skip > 0,
    ),
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
    mutationFn: async () => parseRpc(api.api.display.$delete()),
    onSuccess: () => {
      queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
        role: "none",
      });
      navigate({to: "/", replace: true});
    },
    onError: (error) => {
      setGameError(
        error instanceof Error ? error.message : "Unable to delete room",
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

      if (message.type === "display.match_found") {
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
              title="Delete room"
              onClick={() => deleteRoomMutation.mutate()}
              disabled={deleteRoomMutation.isPending}>
              End room
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-6">

      <div className="flex flex-col items-center gap-2 py-4">
        <button
          type="button"
          className="group cursor-pointer"
          title="Copy code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(state.summary.code);
            } catch {
              setGameError("Unable to copy game code");
            }
          }}>
          <div className="font-mono text-6xl font-bold tracking-[0.35em] text-foreground transition group-hover:text-accent md:text-8xl">
            {state.summary.code}
          </div>
        </button>
        <p className="text-sm text-muted-foreground">
          {metaQuery.data.summary.roomName || "Tap code to copy"}
        </p>
      </div>

      {viewMode !== "lobby" ? (
        <div className="flex flex-wrap items-center gap-2">
          {playersQuery.data.players.map((player: GamePlayerPresence) => (
            <span
              key={player.id}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
              {player.displayName}
            </span>
          ))}
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
            {state.summary.playerCount} player
            {state.summary.playerCount === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      {gameError ? (
        <div className="rounded-lg border border-swipe-nope/20 bg-swipe-nope/10 px-4 py-2.5 text-sm text-swipe-nope">
          {gameError}
        </div>
      ) : null}

      {viewMode === "lobby" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
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

          <Card>
            <CardHeader className="pb-3 flex flex-row items-baseline justify-between space-y-0">
              <CardTitle className="font-display text-2xl tracking-wide">
                Who&apos;s Playing?
              </CardTitle>
              <span className="font-display text-lg text-muted-foreground">
                {playersQuery.data.players.length}
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-5">
                {playersQuery.data.players.map(
                  (player: GamePlayerPresence) => (
                    <PlayerTile key={player.id} name={player.displayName} />
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <BoardColumn
            title={viewMode === "completed" ? "Final matches" : "Matches"}
            count={board.matches.length}
            tone="match">
            {board.matches.length > 0 ? (
              board.matches.map(({movie, votes}) => (
                <MovieCard key={movie.id} movie={movie} votes={votes} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No matches yet</p>
            )}
          </BoardColumn>

          <BoardColumn
            title="Split decisions"
            count={board.splitDecisions.length}
            tone="neutral">
            {board.splitDecisions.length > 0 ? (
              board.splitDecisions.map(({movie, votes}) => (
                <MovieCard key={movie.id} movie={movie} votes={votes} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing is split yet
              </p>
            )}
          </BoardColumn>

          <BoardColumn
            title="Rejected"
            count={board.rejected.length}
            tone="rejected">
            {board.rejected.length > 0 ? (
              board.rejected.map(({movie, votes}) => (
                <MovieCard key={movie.id} movie={movie} votes={votes} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing rejected yet
              </p>
            )}
          </BoardColumn>
        </div>
      )}
      </div>
    </div>
  );
}

function BoardColumn({
  children,
  count,
  title,
  tone,
}: {
  children: ReactNode;
  count: number;
  title: string;
  tone: "match" | "neutral" | "rejected";
}) {
  const toneClass =
    tone === "match"
      ? "text-swipe-like"
      : tone === "rejected"
        ? "text-swipe-nope"
        : "text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 ${toneClass}`}>
        {tone === "match" ? <HeartIcon size={18} /> : null}
        {tone === "rejected" ? <XCircleIcon size={18} /> : null}
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">
          {title} ({count})
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const PLAYER_TILE_GRADIENTS = [
  "from-red-500 to-rose-700",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-fuchsia-400 to-purple-600",
  "from-pink-400 to-rose-600",
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function PlayerTile({name}: {name: string}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const gradient =
    PLAYER_TILE_GRADIENTS[hashString(name) % PLAYER_TILE_GRADIENTS.length];
  return (
    <div className="group flex w-24 flex-col items-center gap-2">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-md bg-gradient-to-br ${gradient} font-display text-5xl text-white shadow-[0_4px_20px_rgba(0,0,0,0.3)] ring-0 ring-white transition-all duration-150 group-hover:ring-2`}>
        {initial}
      </div>
      <div className="w-full truncate text-center font-display text-sm tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
        {name}
      </div>
    </div>
  );
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

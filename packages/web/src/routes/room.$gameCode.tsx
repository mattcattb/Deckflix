import {useEffect, useMemo, useRef, useState} from "react";
import {createFileRoute, Link, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery} from "@tanstack/react-query";
import type {
  ActiveGameSession,
  DisplayGameSnapshot,
  GamePublicSnapshot,
  GameVoteSummary,
  MovieCandidate,
  PlayerGameSnapshot,
  RoomSessionSnapshot,
  SwipeChoice,
} from "@deckflix/shared";
import {Button, Card, CardContent, Input, Label} from "../components/ui";
import {MovieCard} from "../components/games/movie-card";
import {SwipeControls} from "../components/games/player/swipe-controls";
import {SwipeDeck} from "../components/games/player/swipe-stack";
import {API_BASE_URL, api, throwApiError} from "../lib/api";
import {
  createDisplayWebSocketUrl,
  createPlayerWebSocketUrl,
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "../lib/games";

export const Route = createFileRoute("/room/$gameCode")({
  component: RoomPage,
});

type DisplayBoardItem = {
  movie: MovieCandidate;
  votes: GameVoteSummary;
};

const getBoardSections = (snapshot: DisplayGameSnapshot | null) => {
  if (!snapshot) {
    return {
      matches: [] as DisplayBoardItem[],
      splitDecisions: [] as DisplayBoardItem[],
      rejected: [] as DisplayBoardItem[],
    };
  }

  const boardItems = snapshot.queue
    .map((item) => {
      const votes = snapshot.results.voteSummary.find((entry) => entry.movieId === item.movie.id);
      return votes ? {movie: item.movie, votes} : null;
    })
    .filter((item): item is DisplayBoardItem => Boolean(item));

  return {
    matches: boardItems.filter(({votes}) => votes.matched),
    splitDecisions: boardItems.filter(
      ({votes}) => votes.totalVotes > 0 && votes.like + votes.superLike > 0 && votes.dislike + votes.skip > 0,
    ),
    rejected: boardItems.filter(
      ({votes}) =>
        votes.totalVotes >= snapshot.summary.playerCount &&
        votes.totalVotes > 0 &&
        votes.like + votes.superLike + votes.maybe === 0,
    ),
  };
};

function RoomPage() {
  const {gameCode} = Route.useParams();
  const navigate = useNavigate();

  const activeSessionQuery = useQuery({
    queryKey: ["active-game-session"],
    queryFn: async () => {
      const response = await api.api.games.session.$get();
      if (!response.ok) {
        await throwApiError(response, "GET /api/games/session");
      }

      return (await response.json()) as ActiveGameSession;
    },
  });

  useEffect(() => {
    if (!activeSessionQuery.data || activeSessionQuery.data.role === "none") {
      return;
    }

    if (activeSessionQuery.data.gameCode !== gameCode) {
      navigate({
        to: "/room/$gameCode",
        params: {gameCode: activeSessionQuery.data.gameCode},
        replace: true,
      });
    }
  }, [activeSessionQuery.data, gameCode, navigate]);

  const roomQuery = useQuery({
    queryKey: ["room", gameCode],
    queryFn: async () => {
      const response = await api.api.games[":gameCode"].session.$get({
        param: {gameCode},
      });

      if (!response.ok) {
        await throwApiError(response, `GET /api/games/${gameCode}/session`);
      }

      return (await response.json()) as RoomSessionSnapshot;
    },
  });

  if (activeSessionQuery.isLoading || roomQuery.isLoading) {
    return null;
  }

  if (
    activeSessionQuery.data &&
    activeSessionQuery.data.role !== "none" &&
    activeSessionQuery.data.gameCode !== gameCode
  ) {
    return null;
  }

  if (roomQuery.error || !roomQuery.data) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-16">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="text-2xl font-semibold font-display">Room unavailable</h1>
            <p className="text-sm text-muted-foreground">
              {roomQuery.error instanceof Error
                ? roomQuery.error.message
                : "This room is not available."}
            </p>
            <Link to="/" className="block">
              <Button className="w-full">Back home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (roomQuery.data.role === "display") {
    return (
      <DisplayRoomView
        gameCode={gameCode}
        initialSnapshot={roomQuery.data.game}
        onSessionChange={() => void roomQuery.refetch()}
      />
    );
  }

  if (roomQuery.data.role === "player") {
    return (
      <PlayerRoomView
        gameCode={gameCode}
        initialSnapshot={roomQuery.data.game}
        onSessionChange={() => void roomQuery.refetch()}
      />
    );
  }

  return (
    <JoinRoomView
      gameCode={gameCode}
      game={roomQuery.data.game}
      onJoined={() => void roomQuery.refetch()}
    />
  );
}

function JoinRoomView({
  gameCode,
  game,
  onJoined,
}: {
  gameCode: string;
  game: GamePublicSnapshot;
  onJoined: () => void;
}) {
  const [displayName, setDisplayName] = useState("");

  const joinGameMutation = useMutation({
    mutationFn: async () => {
      const response = await api.api.games[":gameCode"].players.$post({
        param: {gameCode},
        json: {
          displayName: displayName.trim(),
        },
      });

      if (!response.ok) {
        await throwApiError(response, `POST /api/games/${gameCode}/players`);
      }

      return response.json();
    },
    onSuccess: async () => {
      setDisplayName("");
      onJoined();
    },
  });

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Game code — big and central */}
        <div className="flex flex-col items-center gap-2">
          <Link to="/" className="text-lg font-bold tracking-tight font-display">
            DECK<span className="flame-text">FLIX</span>
          </Link>
          <div className="font-mono text-5xl font-bold tracking-[0.35em] text-foreground md:text-6xl">
            {game.summary.code}
          </div>
          {game.summary.roomName ? (
            <p className="text-sm text-muted-foreground">{game.summary.roomName}</p>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {game.summary.playerCount} player{game.summary.playerCount === 1 ? "" : "s"} in room
          </span>
        </div>

        {/* Join form */}
        <Card className="border-white/[0.06] bg-black/40">
          <CardContent className="space-y-4 p-6">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!displayName.trim()) {
                  return;
                }
                joinGameMutation.mutate();
              }}>
              <div className="space-y-2">
                <Label htmlFor="room-display-name">Your name</Label>
                <Input
                  id="room-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="What should the room call you?"
                  autoFocus
                />
              </div>

              <Button effect="glow" className="w-full" type="submit" disabled={joinGameMutation.isPending}>
                {joinGameMutation.isPending ? "Joining..." : "Join game"}
              </Button>
            </form>

            {joinGameMutation.error ? (
              <p className="rounded-lg border border-swipe-nope/20 bg-swipe-nope/10 px-3 py-2 text-sm text-swipe-nope">
                {joinGameMutation.error instanceof Error
                  ? joinGameMutation.error.message
                  : "Unable to join game"}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DisplayRoomView({
  gameCode,
  initialSnapshot,
  onSessionChange,
}: {
  gameCode: string;
  initialSnapshot: DisplayGameSnapshot;
  onSessionChange: () => void;
}) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [gameError, setGameError] = useState<string | null>(null);
  const [latestMatchMovieId, setLatestMatchMovieId] = useState<string | null>(null);
  const [lastJoinedPlayer, setLastJoinedPlayer] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const deleteRoomMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/games/${gameCode}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        await throwApiError(response, `DELETE /api/games/${gameCode}`);
      }
    },
    onSuccess: () => {
      navigate({
        to: "/",
        replace: true,
      });
    },
    onError: (error) => {
      setGameError(error instanceof Error ? error.message : "Unable to delete room");
    },
  });

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    const socket = new WebSocket(createDisplayWebSocketUrl(gameCode));
    socketRef.current = socket;

    socket.onopen = () => {
      setGameError(null);
    };

    socket.onclose = (event) => {
      if (event.code === 4001) {
        onSessionChange();
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
        setSnapshot(message.payload);
        return;
      }

      if (message.type === "display.player_joined") {
        setLastJoinedPlayer(message.payload.displayName);
        return;
      }

      if (message.type === "display.match_found") {
        setLatestMatchMovieId(message.payload.movieId);
        return;
      }

      if (message.type === "display.error") {
        setGameError(message.payload.message);
      }
    };

    return () => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      socketRef.current = null;
    };
  }, [gameCode, onSessionChange]);

  const board = useMemo(() => getBoardSections(snapshot), [snapshot]);
  const latestMatch =
    snapshot.queue.find((item) => item.movie.id === latestMatchMovieId)?.movie ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-5 py-6">
      {/* Top bar: logo + actions */}
      <div className="flex items-center justify-between">
        <Link to="/" className="text-lg font-bold tracking-tight font-display">
          DECK<span className="flame-text">FLIX</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {snapshot.summary.playerCount} player{snapshot.summary.playerCount === 1 ? "" : "s"}
          </span>
          <Link to="/">
            <button type="button" className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground" title="Home">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-swipe-nope/20 hover:text-swipe-nope"
            title="Delete room"
            onClick={() => deleteRoomMutation.mutate()}
            disabled={deleteRoomMutation.isPending}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Hero: giant game code */}
      <div className="flex flex-col items-center gap-2 py-4">
        <button
          type="button"
          className="group cursor-pointer"
          title="Copy code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(gameCode.toUpperCase());
            } catch {
              setGameError("Unable to copy game code");
            }
          }}>
          <div className="font-mono text-6xl font-bold tracking-[0.35em] text-foreground transition group-hover:text-accent md:text-8xl">
            {snapshot.summary.code}
          </div>
        </button>
        <p className="text-sm text-muted-foreground">
          {snapshot.summary.roomName ? snapshot.summary.roomName : "Tap code to copy"}
        </p>
      </div>

      {/* Alerts */}
      {gameError ? (
        <div className="rounded-lg border border-swipe-nope/20 bg-swipe-nope/10 px-4 py-2.5 text-sm text-swipe-nope">
          {gameError}
        </div>
      ) : null}

      {lastJoinedPlayer ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm">
          <span className="font-semibold">{lastJoinedPlayer}</span> joined
        </div>
      ) : null}

      {latestMatch ? (
        <div className="rounded-lg border border-swipe-like/20 bg-swipe-like/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-swipe-like">
            <HeartIcon size={16} />
            It&apos;s a match!
          </div>
          <div className="text-sm text-foreground">{latestMatch.title}</div>
        </div>
      ) : null}

      {/* Board: matches + rejected */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Matches — green */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-swipe-like">
            <HeartIcon size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">
              Matches ({board.matches.length})
            </span>
          </div>
          {board.matches.length > 0 ? (
            <div className="space-y-2">
              {board.matches.map(({movie, votes}) => (
                <MovieCard key={movie.id} movie={movie} votes={votes} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No matches yet</p>
          )}
        </div>

        {/* Rejected — red */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-swipe-nope">
            <XCircleIcon size={18} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">
              Rejected ({board.rejected.length})
            </span>
          </div>
          {board.rejected.length > 0 ? (
            <div className="space-y-2">
              {board.rejected.map(({movie, votes}) => (
                <MovieCard key={movie.id} movie={movie} votes={votes} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing rejected yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerRoomView({
  gameCode,
  initialSnapshot,
  onSessionChange,
}: {
  gameCode: string;
  initialSnapshot: PlayerGameSnapshot;
  onSessionChange: () => void;
}) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [gameError, setGameError] = useState<string | null>(null);
  const [latestMatchMovieId, setLatestMatchMovieId] = useState<string | null>(null);
  const [lastRecordedVote, setLastRecordedVote] = useState<SwipeChoice | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  const voteMutation = useMutation({
    mutationFn: async (payload: {movieId: string; choice: SwipeChoice; playerId: string}) => {
      const response = await fetch(
        `${API_BASE_URL}/api/games/${gameCode}/players/${payload.playerId}/votes`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            movieId: payload.movieId,
            choice: payload.choice,
          }),
        },
      );

      if (!response.ok) {
        await throwApiError(response, `POST /api/games/${gameCode}/players/${payload.playerId}/votes`);
      }

      return response.json();
    },
    onSuccess: (result) => {
      setSnapshot(result.game);
    },
    onError: (error) => {
      setGameError(error instanceof Error ? error.message : "Unable to record vote");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await fetch(
        `${API_BASE_URL}/api/games/${gameCode}/players/${playerId}/leave`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!response.ok) {
        await throwApiError(response, `POST /api/games/${gameCode}/players/${playerId}/leave`);
      }
    },
    onSuccess: () => {
      onSessionChange();
      navigate({
        to: "/",
        replace: true,
      });
    },
  });

  useEffect(() => {
    const socket = new WebSocket(createPlayerWebSocketUrl(gameCode));
    socketRef.current = socket;

    socket.onopen = () => {
      setGameError(null);
    };

    socket.onclose = (event) => {
      if (event.code === 4001) {
        onSessionChange();
        return;
      }

      if (event.reason) {
        setGameError(`Player socket closed: ${event.reason}`);
      }
    };

    socket.onerror = () => {
      setGameError("Player socket error");
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const message = parsePlayerServerMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === "player.snapshot") {
        setSnapshot(message.payload);
        return;
      }

      if (message.type === "player.vote_recorded") {
        setLastRecordedVote(message.payload.choice);
        return;
      }

      if (message.type === "player.match_found") {
        setLatestMatchMovieId(message.payload.movieId);
        return;
      }

      if (message.type === "player.error") {
        setGameError(message.payload.message);
      }
    };

    return () => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }

      socketRef.current = null;
    };
  }, [gameCode, onSessionChange]);

  const vote = (choice: SwipeChoice, movieId?: string) => {
    if (!snapshot.currentItem) {
      return;
    }

    setGameError(null);
    voteMutation.mutate({
      playerId: snapshot.me.playerId,
      movieId: movieId ?? snapshot.currentItem.movie.id,
      choice,
    });
  };

  const canVote = snapshot.summary.playerCount >= 2 && !snapshot.me.completed;
  const progressLabel = `${Math.min(snapshot.me.currentIndex + 1, snapshot.summary.queueSize)}/${snapshot.summary.queueSize}`;
  const latestMatch = snapshot.results.voteSummary.find((entry) => entry.movieId === latestMatchMovieId) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-lg font-bold tracking-tight font-display">
              {snapshot.summary.code}
            </Link>
            <div className="h-4 w-px bg-white/[0.1]" />
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Controller
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {snapshot.summary.playerCount} player{snapshot.summary.playerCount === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-muted-foreground">{progressLabel}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => leaveMutation.mutate(snapshot.me.playerId)}
              disabled={leaveMutation.isPending}>
              Leave game
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pt-6">
        {gameError ? (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {gameError}
          </div>
        ) : null}

        {latestMatch ? (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div className="text-sm font-semibold text-primary">Match found in the room</div>
            <div className="text-sm text-foreground">
              Movie ID <span className="font-mono">{latestMatch.movieId}</span> just hit the threshold.
            </div>
          </div>
        ) : null}

        {lastRecordedVote ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-muted-foreground">
            Last vote recorded: <span className="text-foreground">{lastRecordedVote.replace("_", " ")}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-8">
        {!canVote ? (
          <div className="text-center text-muted-foreground">
            {snapshot.summary.playerCount < 2 ? (
              <>
                <p className="text-lg font-semibold">Waiting for another player</p>
                <p className="mt-1 text-sm">
                  Voting starts once at least two players are in the game.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">You are done for this round</p>
                <p className="mt-1 text-sm">Watch the display for the final board.</p>
              </>
            )}
          </div>
        ) : snapshot.currentItem ? (
          <div className="w-full max-w-sm space-y-5">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Your controller
              </div>
              <h1 className="mt-2 text-2xl font-semibold font-display">
                {snapshot.me.displayName}
              </h1>
            </div>
            <SwipeDeck
              item={snapshot.currentItem}
              onSwipe={(choice, movieId) => vote(choice, movieId)}
              disabled={voteMutation.isPending}
            />
            <SwipeControls
              onSwipe={(choice) => vote(choice)}
              disabled={voteMutation.isPending}
              allowMaybe={snapshot.settings.allowMaybe}
              allowSuperLike={snapshot.settings.allowSuperLike}
            />
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-semibold">No more movies in your queue</p>
            <p className="mt-1 text-sm">Watch the display for the result.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HeartIcon({size = 20}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function XCircleIcon({size = 20}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

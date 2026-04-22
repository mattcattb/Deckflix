import {useEffect, useRef, useState} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {
  ActiveRoomClient,
  GameResults,
  PlayerGameState,
  SwipeChoice,
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activePlayerStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  activeRoomResultsQueryOptions,
  createActivePlayerWebSocketUrl,
  gameKeys,
  parsePlayerServerMessage,
} from "../../lib/games";
import {Button} from "../../components/ui";
import {SwipeControls} from "../../components/games/player/swipe-controls";
import {SwipeDeck} from "../../components/games/player/swipe-stack";
import {RoomUnavailable} from "./room-unavailable";
import {getPlayerRoomViewMode} from "./room-view-modes";

export function PlayerRoomView({gameCode}: {gameCode: string}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [state, setState] = useState<PlayerGameState | null>(null);
  const [results, setResults] = useState<GameResults | null>(null);
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const resultsQuery = useQuery(activeRoomResultsQueryOptions(gameCode));
  const stateQuery = useQuery(activePlayerStateQueryOptions(gameCode));
  const refetchMeta = metaQuery.refetch;
  const refetchPlayers = playersQuery.refetch;
  const refetchResults = resultsQuery.refetch;

  useEffect(() => {
    if (stateQuery.data) {
      setState(stateQuery.data);
    }
  }, [stateQuery.data]);

  useEffect(() => {
    if (resultsQuery.data) {
      setResults(resultsQuery.data);
    }
  }, [resultsQuery.data]);

  const voteMutation = useMutation({
    mutationFn: async (payload: {
      assignmentId: string;
      choice: SwipeChoice;
      movieId: string;
    }) =>
      parseRpc(
        api.api.player.vote.$post({
          json: {
            assignmentId: payload.assignmentId,
            movieId: payload.movieId,
            choice: payload.choice,
          },
        }),
      ),
    onSuccess: (result) => {
      setState(result.state);
      void resultsQuery.refetch();
    },
    onError: (error) => {
      setGameError(
        error instanceof Error ? error.message : "Unable to record vote",
      );
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => parseRpc(api.api.player.leave.$post()),
    onSuccess: () => {
      queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
        role: "none",
      });
      navigate({to: "/", replace: true});
    },
    onError: (error) => {
      setGameError(
        error instanceof Error ? error.message : "Unable to leave game",
      );
    },
  });

  useEffect(() => {
    const socket = new WebSocket(createActivePlayerWebSocketUrl());
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
        setState(message.payload);
        void refetchMeta();
        void refetchPlayers();
        void refetchResults();
        return;
      }

      if (message.type === "player.room_ended") {
        void parseRpc(api.api.room.current.$delete()).catch(() => undefined);
        queryClient.setQueryData<ActiveRoomClient>(gameKeys.activeClient, {
          role: "none",
        });
        navigate({to: "/", replace: true});
        return;
      }

      if (message.type === "player.vote_recorded") {
        return;
      }

      if (message.type === "player.match_found") {
        return;
      }

      if (message.type === "player.error") {
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
  }, [navigate, queryClient, refetchMeta, refetchPlayers, refetchResults]);

  if (
    metaQuery.isLoading ||
    playersQuery.isLoading ||
    resultsQuery.isLoading ||
    stateQuery.isLoading ||
    !state ||
    !results
  ) {
    return null;
  }

  if (
    metaQuery.error ||
    playersQuery.error ||
    resultsQuery.error ||
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
                : resultsQuery.error instanceof Error
                  ? resultsQuery.error.message
                  : "This room is not available."
        }
      />
    );
  }

  const vote = (choice: SwipeChoice, movieId?: string) => {
    if (!state.currentItem) {
      return;
    }

    setGameError(null);
    voteMutation.mutate({
      assignmentId: state.currentItem.assignmentId,
      choice,
      movieId: movieId ?? state.currentItem.movie.id,
    });
  };

  const viewMode = getPlayerRoomViewMode(state.summary.status);
  const progressLabel = `${Math.min(state.me.currentIndex + 1, state.summary.queueSize)}/${state.summary.queueSize}`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/play" className="text-lg font-bold tracking-tight font-display">
              {state.summary.code}
            </Link>
            <div className="h-4 w-px bg-white/[0.1]" />
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {viewMode}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {playersQuery.data.players.length} player
              {playersQuery.data.players.length === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-muted-foreground">
              {progressLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}>
              Leave game
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pt-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {playersQuery.data.players.map((player) => (
            <span
              key={player.id}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
              {player.displayName}
            </span>
          ))}
        </div>

        {gameError ? (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {gameError}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-8">
        {viewMode === "waiting" ? (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-semibold">
              {state.summary.playerCount < 2
                ? "Waiting for another player"
                : "Waiting for the display to start"}
            </p>
            <p className="mt-1 text-sm">
              {state.summary.playerCount < 2
                ? "Voting starts once at least two players are in the room."
                : "The room is ready. The display can start the round any time."}
            </p>
          </div>
        ) : viewMode === "completed" ? (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-semibold">This round is complete</p>
            <p className="mt-1 text-sm">
              Watch the display for the final board and matches.
            </p>
          </div>
        ) : state.currentItem ? (
          <div className="w-full max-w-sm space-y-5">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Your controller
              </div>
              <h1 className="mt-2 text-2xl font-semibold font-display">
                {state.me.displayName}
              </h1>
            </div>
            <SwipeDeck
              item={state.currentItem}
              onSwipe={(choice, movieId) => vote(choice, movieId)}
              disabled={voteMutation.isPending}
            />
            <SwipeControls
              onSwipe={(choice) => vote(choice)}
              disabled={voteMutation.isPending}
              allowMaybe={state.settings.gameplay.allowMaybe}
              allowSuperLike={state.settings.gameplay.allowSuperLike}
            />
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-semibold">
              You are done for this round
            </p>
            <p className="mt-1 text-sm">
              Watch the display while everyone else finishes swiping.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

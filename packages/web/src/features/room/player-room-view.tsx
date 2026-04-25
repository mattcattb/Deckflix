import {useCallback, useEffect, useRef, useState} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {
  ActiveRoomClient,
  PlayerGameState,
  SwipeChoice,
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activePlayerStateQueryOptions,
  clearActiveRoomSession,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  createActivePlayerWebSocketUrl,
  gameKeys,
  isMissingRoomSessionError,
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
  const didClearSessionRef = useRef(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [state, setState] = useState<PlayerGameState | null>(null);
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const stateQuery = useQuery(activePlayerStateQueryOptions(gameCode));
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
    const roomError =
      metaQuery.error ??
      playersQuery.error ??
      stateQuery.error;
    if (roomError && isMissingRoomSessionError(roomError)) {
      resetRoomSession();
    }
  }, [metaQuery.error, playersQuery.error, resetRoomSession, stateQuery.error]);

  const voteMutation = useMutation({
    mutationFn: async (payload: {
      choice: SwipeChoice;
      movieId: string;
    }) =>
      parseRpc(
        api.api.player.vote.$post({
          json: {
            movieId: payload.movieId,
            choice: payload.choice,
          },
        }),
      ),
    onSuccess: (result) => {
      setState(result.state);
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

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
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

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
        resetRoomSession();
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
        return;
      }

      if (message.type === "room.status_changed") {
        void refetchMeta();
        void refetchPlayers();
        return;
      }

      if (message.type === "room.deleted") {
        resetRoomSession();
        return;
      }

      if (message.type === "swipe.vote_recorded") {
        return;
      }

      if (message.type === "swipe.match_found") {
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

  if (
    metaQuery.isLoading ||
    playersQuery.isLoading ||
    stateQuery.isLoading ||
    !state
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

  const vote = (choice: SwipeChoice, movieId?: string) => {
    if (!state.currentItem) {
      return;
    }

    setGameError(null);
    voteMutation.mutate({
      choice,
      movieId: movieId ?? state.currentItem.movie.id,
    });
  };

  const viewMode = getPlayerRoomViewMode(state.summary.status);
  const profileInitial = state.me.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/92 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/play"
              className="netflix-wordmark text-2xl uppercase tracking-[0.08em] sm:text-3xl">
              Deck<span className="flame-text">flix</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-red-500 to-rose-700 text-sm font-semibold text-white">
                {profileInitial}
              </div>
              <div className="min-w-0 truncate text-sm font-medium text-white">
                {state.me.displayName}
              </div>
            </div>
          </div>

            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 font-mono text-xl font-bold tracking-[0.24em] text-primary transition hover:text-[hsl(357_92%_55%)] sm:text-2xl"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.summary.code);
                  setGameError(null);
                } catch {
                  setGameError("Unable to copy room code");
                }
              }}>
              {state.summary.code}
            </button>

          <div className="flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
              {playersQuery.data.players.length} player
              {playersQuery.data.players.length === 1 ? "" : "s"}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}>
              Leave
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">

          {gameError ? (
            <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {gameError}
            </div>
          ) : null}

          <div className="flex flex-1 items-center justify-center py-4">
            {viewMode === "waiting" ? (
              <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-[#111] px-8 py-10 text-center">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                  Controller
                </div>
                <p className="mt-4 text-2xl font-medium font-display text-white">
                  {state.summary.playerCount < 2
                    ? "Waiting for another player"
                    : "Waiting for the display to start"}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  {state.summary.playerCount < 2
                    ? "Voting starts once at least two players are in the room."
                    : "The room is ready. The display can start the round any time."}
                </p>
              </div>
            ) : viewMode === "completed" ? (
              <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-[#111] px-8 py-10 text-center">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                  Controller
                </div>
                <p className="mt-4 text-2xl font-medium font-display text-white">
                  This round is complete
                </p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  Watch the display for the final board and matches.
                </p>
              </div>
            ) : state.currentItem ? (
              <div className="w-full max-w-sm space-y-4">
                <SwipeDeck
                  item={state.currentItem}
                  onSwipe={(choice, movieId) => vote(choice, movieId)}
                  disabled={voteMutation.isPending}
                />
                <SwipeControls
                  onSwipe={(choice) => vote(choice)}
                  disabled={voteMutation.isPending}
                />
              </div>
            ) : (
              <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-[#111] px-8 py-10 text-center">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                  Controller
                </div>
                <p className="mt-4 text-2xl font-medium font-display text-white">
                  You are done for this round
                </p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  Watch the display while everyone else finishes swiping.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

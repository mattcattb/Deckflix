import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {
  ActiveRoomClient,
  PlayerGameState,
  SwipeChoice,
} from "@deckflix/shared";
import {api, parseRpc} from "../../lib/api";
import {
  activePlayerStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
} from "./room.queries";
import {
  activeRoomSessionKeys,
  clearActiveRoomSession,
  isMissingRoomSessionError,
} from "./room-session";
import {
  createActiveRoomWebSocketUrl,
  parsePlayerServerMessage,
} from "./room.ws";
import {Eyebrow, ProfileIdentity} from "../../components/common";
import {Button} from "../../components/ui";
import {SwipeControls} from "./swipe/swipe-controls";
import {SwipeDeck} from "./swipe/swipe-stack";
import {RoomUnavailable} from "./room-unavailable";
import {getPlayerRoomViewMode} from "./room-view-modes";
import {PlayerStatusPanel} from "./player-status-panel";
import {RoomHeader, RoomScreenShell} from "./room-screen-shell";

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
        api.api.game.vote.$post({
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
    mutationFn: async () => parseRpc(api.api.room.leave.$post()),
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
        error instanceof Error ? error.message : "Unable to leave game",
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

  return (
    <RoomScreenShell
      error={gameError}
      header={
        <RoomHeader
          brandTo="/play"
          title={
            <ProfileIdentity
              avatarSize="sm"
              colorKey={state.me.displayName}
              displayName={state.me.displayName}
            />
          }
          center={
            <button
              type="button"
              className="font-mono text-xl font-bold tracking-[0.24em] text-primary transition hover:text-[hsl(357_92%_55%)] sm:text-2xl"
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
          }
          actions={
            <>
              <Eyebrow className="text-white/45" size="sm">
                {playersQuery.data.players.length} player
                {playersQuery.data.players.length === 1 ? "" : "s"}
              </Eyebrow>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}>
                Leave
              </Button>
            </>
          }
        />
      }
      widthClassName="flex max-w-5xl flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center py-4">
        {viewMode === "waiting" ? (
          <PlayerStatusPanel
            title={
              state.summary.playerCount < 2
                ? "Waiting for another player"
                : "Waiting for the display to start"
            }
            body={
              state.summary.playerCount < 2
                ? "Voting starts once at least two players are in the room."
                : "The room is ready. The display can start the round any time."
            }
          />
        ) : viewMode === "completed" ? (
          <PlayerStatusPanel
            title="This round is complete"
            body="Watch the display for the final board and matches."
          />
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
          <PlayerStatusPanel
            title="You are done for this round"
            body="Watch the display while everyone else finishes swiping."
          />
        )}
      </div>
    </RoomScreenShell>
  );
}

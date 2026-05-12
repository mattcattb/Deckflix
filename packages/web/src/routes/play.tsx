import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {QueryClient} from "@tanstack/react-query";
import {createFileRoute, redirect, useNavigate} from "@tanstack/react-router";
import type {
  ActiveRoomClient,
  PlayerIconId,
  PlayerGameState,
  SwipeChoice,
} from "@deckflix/shared";
import {playerIconIds} from "@deckflix/shared";
import {Eyebrow, ProfileIdentity} from "../components/common";
import {Button, Input, Label, useToast} from "../components/ui";
import {api, parseRpc} from "../lib/api";
import {RoomUnavailable} from "../features/room/room-unavailable";
import {PlayerStatusPanel} from "../features/player/PlayerStatusPanel";
import {RoomHeader, RoomScreenShell} from "../components/layout";
import {
  activePlayerStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  activeRoomResultsQueryOptions,
} from "../features/room/room.queries";
import {
  activeRoomSessionKeys,
  clearActiveRoomSession,
  clearStoredRoomSessionToken,
  isMissingRoomSessionError,
} from "../features/room/room-session";
import {
  createActiveRoomWebSocketUrl,
  parsePlayerServerMessage,
} from "../features/room/room.ws";
import {SwipeControls} from "../features/swipe/SwipeControls";
import {SwipeDeck} from "../features/swipe/SwipeDeck";
import {getPlayerRoomViewMode} from "../features/room/room-view-modes";
import {requirePlayerRoom} from "./room-route-guards";

const prefetchPlayerRoom = async (
  queryClient: QueryClient,
  gameCode: string,
) => {
  await Promise.all([
    queryClient.prefetchQuery(activeRoomMetaQueryOptions(gameCode)),
    queryClient.prefetchQuery(activeRoomPlayersQueryOptions(gameCode)),
    queryClient.prefetchQuery(activeRoomResultsQueryOptions(gameCode)),
    queryClient.prefetchQuery(activePlayerStateQueryOptions(gameCode)),
  ]);
};

export const Route = createFileRoute("/play")({
  beforeLoad: ({context}) => requirePlayerRoom(context.activeClient),
  loader: async ({context}) => {
    const activeClient = requirePlayerRoom(context.activeClient);

    try {
      await prefetchPlayerRoom(context.queryClient, activeClient.gameCode);
    } catch (error) {
      if (isMissingRoomSessionError(error)) {
        await clearActiveRoomSession(
          context.queryClient,
          activeClient.gameCode,
        );
        throw redirect({to: "/", replace: true});
      }

      throw error;
    }

    return activeClient;
  },
  component: ActivePlayPage,
});

function ActivePlayPage() {
  const activeClient = Route.useLoaderData();
  return <PlayerRoomView gameCode={activeClient.gameCode} />;
}

function PlayerRoomView({gameCode}: {gameCode: string}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {notify} = useToast();
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
    const roomError = metaQuery.error ?? playersQuery.error ?? stateQuery.error;
    if (roomError && isMissingRoomSessionError(roomError)) {
      resetRoomSession();
    }
  }, [metaQuery.error, playersQuery.error, resetRoomSession, stateQuery.error]);

  const voteMutation = useMutation({
    mutationFn: async (payload: {choice: SwipeChoice; movieId: string}) =>
      parseRpc(
        api.api.game.vote.$post({
          json: {
            movieId: payload.movieId,
            choice: payload.choice,
          },
        }),
      ),
    onSuccess: (result) => {
      setState((current) =>
        current
          ? {
              ...current,
              me: {
                ...current.me,
                ...result.statePatch.me,
              },
              currentItem: result.statePatch.currentItem,
              remainingCount: result.statePatch.remainingCount,
            }
          : current,
      );
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

      setGameError(
        error instanceof Error ? error.message : "Unable to leave game",
      );
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (payload: {displayName: string; iconId: PlayerIconId}) =>
      parseRpc(
        api.api.player.me.$patch({
          json: payload,
        }),
      ),
    onSuccess: (player) => {
      setGameError(null);
      setState((current) =>
        current
          ? {
              ...current,
              me: {
                ...current.me,
                displayName: player.displayName,
                iconId: player.iconId,
              },
            }
          : current,
      );
      void refetchPlayers();
      notify({
        title: "Profile updated",
        type: "success",
      });
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to update profile",
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

      if (message.type === "player.kicked") {
        notify({
          title: "Removed from room",
          description: "You can rejoin from the room code screen.",
          type: "info",
        });
        resetRoomSession();
        return;
      }

      if (message.type === "player.updated") {
        setState((current) =>
          current
            ? {
                ...current,
                me:
                  message.player.id === current.me.playerId
                    ? {
                        ...current.me,
                        displayName: message.player.displayName,
                        iconId: message.player.iconId,
                      }
                    : current.me,
              }
            : current,
        );
        void refetchPlayers();
        return;
      }

      if (message.type === "game.vote_recorded") {
        return;
      }

      if (message.type === "game.match_found") {
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
  }, [notify, refetchMeta, refetchPlayers, resetRoomSession]);

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
              iconKey={state.me.iconId}
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
      <PlayerRoomBody
        isVoting={voteMutation.isPending}
        profilePending={profileMutation.isPending}
        state={state}
        onProfileSubmit={(payload) => profileMutation.mutate(payload)}
        onVote={vote}
      />
    </RoomScreenShell>
  );
}

function PlayerRoomBody({
  isVoting,
  onProfileSubmit,
  onVote,
  profilePending,
  state,
}: {
  isVoting: boolean;
  onProfileSubmit: (payload: {displayName: string; iconId: PlayerIconId}) => void;
  onVote: (choice: SwipeChoice, movieId?: string) => void;
  profilePending: boolean;
  state: PlayerGameState;
}) {
  const viewMode = getPlayerRoomViewMode(state.summary.status);

  if (viewMode === "waiting") {
    return (
      <PlayerRoomBodyFrame>
        <div className="w-full max-w-md space-y-5">
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
          <PlayerProfileEditor
            displayName={state.me.displayName}
            iconId={state.me.iconId}
            pending={profilePending}
            onSubmit={onProfileSubmit}
          />
        </div>
      </PlayerRoomBodyFrame>
    );
  }

  if (viewMode === "completed") {
    return (
      <PlayerRoomBodyFrame>
        <PlayerStatusPanel
          title="This round is complete"
          body="Watch the display for the final board and matches."
        />
      </PlayerRoomBodyFrame>
    );
  }

  if (!state.currentItem) {
    return (
      <PlayerRoomBodyFrame>
        <PlayerStatusPanel
          title="You are done for this round"
          body="Watch the display while everyone else finishes swiping."
        />
      </PlayerRoomBodyFrame>
    );
  }

  return (
    <PlayerRoomBodyFrame>
      <div className="w-full max-w-sm space-y-4">
        <SwipeDeck
          item={state.currentItem}
          onSwipe={(choice, movieId) => onVote(choice, movieId)}
          disabled={isVoting}
        />
        <SwipeControls
          onSwipe={(choice) => onVote(choice)}
          disabled={isVoting}
        />
      </div>
    </PlayerRoomBodyFrame>
  );
}

function PlayerProfileEditor({
  displayName,
  iconId,
  onSubmit,
  pending,
}: {
  displayName: string;
  iconId: PlayerIconId;
  onSubmit: (payload: {displayName: string; iconId: PlayerIconId}) => void;
  pending: boolean;
}) {
  const [draftName, setDraftName] = useState(displayName);
  const [draftIconId, setDraftIconId] = useState<PlayerIconId>(iconId);

  useEffect(() => {
    setDraftName(displayName);
    setDraftIconId(iconId);
  }, [displayName, iconId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      displayName: draftName,
      iconId: draftIconId,
    });
  };

  return (
    <form
      className="space-y-4 border-t border-white/10 pt-5"
      onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="player-display-name">Display name</Label>
        <Input
          id="player-display-name"
          maxLength={40}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Icon</Label>
        <div className="grid grid-cols-3 gap-2">
          {playerIconIds.map((item) => (
            <button
              key={item}
              type="button"
              className={
                item === draftIconId
                  ? "rounded border border-primary bg-primary/15 px-3 py-2 text-sm font-semibold text-white"
                  : "rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/[0.08]"
              }
              onClick={() => setDraftIconId(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <Button
        className="w-full"
        disabled={pending || draftName.trim().length === 0}
        type="submit"
        variant="secondary">
        Save profile
      </Button>
    </form>
  );
}

function PlayerRoomBodyFrame({children}: {children: ReactNode}) {
  return (
    <div className="flex flex-1 items-center justify-center py-4">
      {children}
    </div>
  );
}

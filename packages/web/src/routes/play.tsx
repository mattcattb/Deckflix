import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
import {PLAYER_DISPLAY_NAME_MAX_LENGTH, playerAvatarIds} from "@deckflix/shared";
import {PlayerAvatarImage, ProfileAvatar} from "../components/common";
import {Button, Input, Label, useToast} from "../components/ui";
import {api, parseRpc} from "../lib/api";
import {RoomUnavailable} from "../features/room/room-unavailable";
import {PlayerStatusPanel} from "../features/player/PlayerStatusPanel";
import {
  RoomHeader,
  RoomScreenShell,
  SocketStatusDot,
} from "../components/layout";
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
import {parsePlayerServerMessage} from "../features/room/room.ws";
import {useRoomWebSocket} from "../features/room/use-room-websocket";
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
  const didClearSessionRef = useRef(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [state, setState] = useState<PlayerGameState | null>(null);
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const stateQuery = useQuery(activePlayerStateQueryOptions(gameCode));
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
    const roomError = metaQuery.error ?? playersQuery.error ?? stateQuery.error;
    if (roomError && isMissingRoomSessionError(roomError)) {
      resetRoomSession();
    }
  }, [metaQuery.error, playersQuery.error, resetRoomSession, stateQuery.error]);

  useEffect(() => {
    if (state?.summary.status !== "swiping" || state.currentItem) {
      return;
    }

    const interval = window.setInterval(() => {
      void refetchState();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [refetchState, state?.currentItem, state?.summary.status]);

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

  const socketStatus = useRoomWebSocket({
    label: "Player",
    onInvalidSession: resetRoomSession,
    onOpen: useCallback(() => {
      setGameError(null);
      void refetchMeta();
      void refetchPlayers();
      void refetchState();
    }, [refetchMeta, refetchPlayers, refetchState]),
    onMessage: useCallback(
      (event: MessageEvent<string>) => {
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
      },
      [notify, refetchMeta, refetchPlayers, resetRoomSession],
    ),
  });

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
            <button
              type="button"
              aria-label={`Copy room code ${state.summary.code}`}
              className="font-mono text-sm font-bold tracking-[0.22em] text-primary transition hover:text-[hsl(357_92%_55%)] sm:text-lg"
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
              <SocketStatusDot status={socketStatus} />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Leave room"
                title="Leave room"
                className="h-9 w-9 rounded-full p-0 text-lg leading-none"
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}>
                <LeaveRoomIcon />
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
        <div className="w-full max-w-md">
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
          title="Finding more movies"
          body="New picks are being added to the room. Your next card will appear here."
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = useState(displayName);
  const [draftIconId, setDraftIconId] = useState<PlayerIconId>(iconId);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  useEffect(() => {
    setDraftName(displayName);
    setDraftIconId(iconId);
  }, [displayName, iconId]);

  useEffect(() => {
    if (!iconPickerOpen) {
      return;
    }

    const closeOnOutsideTap = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIconPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideTap);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTap);
  }, [iconPickerOpen]);

  useEffect(() => {
    const nextName = draftName.trim();
    if (!nextName || nextName === displayName || pending) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onSubmit({
        displayName: nextName,
        iconId: draftIconId,
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [displayName, draftIconId, draftName, onSubmit, pending]);

  const selectIcon = (nextIconId: PlayerIconId) => {
    const nextName = draftName.trim() || displayName;
    setDraftIconId(nextIconId);
    setIconPickerOpen(false);
    onSubmit({
      displayName: nextName,
      iconId: nextIconId,
    });
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-3">
      <div className="flex items-center gap-3 border-b border-white/10 py-3">
        <button
          type="button"
          className="rounded-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Choose player icon"
          onClick={() => setIconPickerOpen((current) => !current)}>
          <ProfileAvatar
            avatarKey={draftIconId}
            displayName={draftName}
            size="xl"
          />
        </button>
        <div className="min-w-0 flex-1">
          <Label className="sr-only" htmlFor="player-display-name">
            Display name
          </Label>
          <Input
            ref={inputRef}
            id="player-display-name"
            maxLength={PLAYER_DISPLAY_NAME_MAX_LENGTH}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => {
              if (!draftName.trim()) {
                setDraftName(displayName);
              }
            }}
            className="h-12 border-0 bg-transparent px-0 text-2xl font-semibold text-white shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded text-white/55 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Edit display name"
          onClick={() => inputRef.current?.focus()}>
          <EditIcon />
        </button>
      </div>

      {iconPickerOpen ? (
        <div className="absolute left-0 top-full z-20 mt-3 grid w-[21rem] max-w-[calc(100vw-2rem)] grid-cols-4 gap-2 rounded border border-white/10 bg-[#111] p-3 shadow-[0_16px_48px_rgb(0_0_0/0.55)]">
          {playerAvatarIds.map((item) => (
            <button
              key={item}
              type="button"
              className={
                item === draftIconId
                  ? "flex h-20 items-center justify-center rounded border border-primary bg-primary/15"
                  : "flex h-20 items-center justify-center rounded border border-white/10 bg-black/20 transition hover:bg-white/[0.08]"
              }
              aria-label={`Choose ${item} avatar`}
              onClick={() => selectIcon(item)}>
              <PlayerAvatarImage avatarKey={item} size="lg" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487 19.5 7.125M5 19l4.2-.8L18.7 8.7a1.8 1.8 0 0 0 0-2.55l-.85-.85a1.8 1.8 0 0 0-2.55 0L5.8 14.8 5 19Z"
      />
    </svg>
  );
}

function LeaveRoomIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M10 12h10m0 0-3-3m3 3-3 3"
      />
    </svg>
  );
}

function PlayerRoomBodyFrame({children}: {children: ReactNode}) {
  return (
    <div className="flex flex-1 items-center justify-center py-4">
      {children}
    </div>
  );
}

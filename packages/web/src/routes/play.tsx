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
  PlayerDeckState,
  PlayerIconId,
  PlayerRoomState,
  SwipeChoice,
  FinaleState,
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
  activePlayerDeckQueryOptions,
  activePlayerRoomQueryOptions,
  activeFinaleQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  activeRoomResultsQueryOptions,
  roomKeys,
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
import {requirePlayerRoom} from "./-room-route-guards";
import {PlayerTastePanel} from "../features/player/PlayerTastePanel";
import {MovieSuggestionPanel} from "../features/player/MovieSuggestionPanel";

const prefetchPlayerRoom = async (
  queryClient: QueryClient,
  gameCode: string,
) => {
  await Promise.all([
    queryClient.prefetchQuery(activeRoomMetaQueryOptions(gameCode)),
    queryClient.prefetchQuery(activeRoomPlayersQueryOptions(gameCode)),
    queryClient.prefetchQuery(activeRoomResultsQueryOptions(gameCode)),
    queryClient.prefetchQuery(activePlayerRoomQueryOptions(gameCode)),
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
  const lastDeckRefreshAtRef = useRef(0);
  const deckRefreshTimeoutScheduledRef = useRef(false);
  const seenNotificationIdsRef = useRef(new Set<string>());
  const [gameError, setGameError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerRoomState | null>(null);
  const [isDeckRefreshQueued, setIsDeckRefreshQueued] = useState(false);
  const metaQuery = useQuery(activeRoomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(activeRoomPlayersQueryOptions(gameCode));
  const playerQuery = useQuery(activePlayerRoomQueryOptions(gameCode));
  const deckQuery = useQuery({
    ...activePlayerDeckQueryOptions(gameCode),
    enabled: playerState?.summary.status === "swiping",
  });
  const finaleQuery = useQuery({
    ...activeFinaleQueryOptions(gameCode),
    enabled:
      playerState?.summary.status === "finale" ||
      playerState?.summary.status === "completed",
  });
  const notificationsQuery = useQuery({
    queryKey: ["room", gameCode, "notifications"],
    queryFn: () => parseRpc(api.api.player.me.notifications.$get()),
    refetchInterval: 4_000,
  });
  const refetchMeta = metaQuery.refetch;
  const refetchPlayers = playersQuery.refetch;
  const refetchPlayer = playerQuery.refetch;
  const refetchDeck = deckQuery.refetch;
  const refetchFinale = finaleQuery.refetch;

  const resetRoomSession = useCallback(() => {
    if (didClearSessionRef.current) {
      return;
    }

    didClearSessionRef.current = true;
    void clearActiveRoomSession(queryClient, gameCode).finally(() => {
      navigate({to: "/", replace: true});
    });
  }, [gameCode, navigate, queryClient]);

  const refreshDeckMutation = useMutation({
    mutationFn: async () => parseRpc(api.api.game.deck.refresh.$post()),
    onSuccess: (deck) => {
      queryClient.setQueryData<PlayerDeckState>(
        roomKeys.playerDeck(gameCode),
        deck,
      );
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to refresh deck",
      );
    },
  });
  const refreshDeck = refreshDeckMutation.mutate;
  const refreshDeckPending = refreshDeckMutation.isPending;

  useEffect(() => {
    if (playerQuery.data) {
      setPlayerState(playerQuery.data);
    }
  }, [playerQuery.data]);

  useEffect(() => {
    for (const item of [...(notificationsQuery.data?.items ?? [])].reverse()) {
      if (seenNotificationIdsRef.current.has(item.id)) continue;
      seenNotificationIdsRef.current.add(item.id);
      notify({type: "success", title: item.title, description: item.message});
    }
  }, [notificationsQuery.data?.items, notify]);

  useEffect(() => {
    const roomError =
      metaQuery.error ??
      playersQuery.error ??
      playerQuery.error ??
      deckQuery.error;
    if (roomError && isMissingRoomSessionError(roomError)) {
      resetRoomSession();
    }
  }, [
    deckQuery.error,
    metaQuery.error,
    playerQuery.error,
    playersQuery.error,
    resetRoomSession,
  ]);

  useEffect(() => {
    if (
      playerState?.summary.status !== "swiping" ||
      deckQuery.data?.currentItem ||
      deckQuery.data?.me.completed ||
      deckQuery.isFetching ||
      deckQuery.isLoading ||
      refreshDeckPending ||
      deckRefreshTimeoutScheduledRef.current
    ) {
      if (deckRefreshTimeoutScheduledRef.current) {
        deckRefreshTimeoutScheduledRef.current = false;
        setIsDeckRefreshQueued(false);
      }
      return;
    }

    const elapsed = Date.now() - lastDeckRefreshAtRef.current;
    const delay = Math.max(0, 2500 - elapsed);
    deckRefreshTimeoutScheduledRef.current = true;
    setIsDeckRefreshQueued(true);
    const timeout = window.setTimeout(() => {
      lastDeckRefreshAtRef.current = Date.now();
      deckRefreshTimeoutScheduledRef.current = false;
      setIsDeckRefreshQueued(false);
      refreshDeck();
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      deckRefreshTimeoutScheduledRef.current = false;
      setIsDeckRefreshQueued(false);
    };
  }, [
    deckQuery.data?.currentItem,
    deckQuery.data?.me.completed,
    deckQuery.isFetching,
    deckQuery.isLoading,
    playerState?.summary.status,
    refreshDeck,
    refreshDeckPending,
  ]);

  const voteMutation = useMutation({
    mutationFn: async (payload: {
      choice: SwipeChoice;
      movieId: string;
      actionId: string;
    }) =>
      parseRpc(
        api.api.game.vote.$post({
          json: {
            movieId: payload.movieId,
            choice: payload.choice,
            actionId: payload.actionId,
          },
        }),
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<PlayerDeckState>(
        roomKeys.playerDeck(gameCode),
        result.statePatch,
      );
      if (!result.statePatch.currentItem) {
        refreshDeck();
      }
      if (result.suggestion) {
        notify({
          type: "info",
          title: `Suggested by ${result.suggestion.suggestedByName}`,
          description: "Your reaction is now helping the room decide.",
        });
      }
    },
    onError: (error) => {
      if (isMissingRoomSessionError(error)) {
        resetRoomSession();
        return;
      }

      setGameError(
        error instanceof Error ? error.message : "Unable to record vote",
      );
      void refetchDeck();
    },
  });

  const finaleVoteMutation = useMutation({
    mutationFn: (movieId: string | null) =>
      parseRpc(api.api.game.finale.vote.$post({json: {movieId}})),
    onSuccess: (state) => {
      queryClient.setQueryData(roomKeys.finale(gameCode), state);
      void refetchMeta();
      void refetchPlayer();
    },
    onError: (error) => {
      setGameError(
        error instanceof Error ? error.message : "Unable to record final vote",
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
      const updatePlayerProfile = (
        current: PlayerRoomState | null | undefined,
      ) =>
        current
          ? {
              ...current,
              me: {
                ...current.me,
                displayName: player.displayName,
                iconId: player.iconId,
              },
            }
          : current;
      setPlayerState((current) => updatePlayerProfile(current) ?? null);
      queryClient.setQueryData<PlayerRoomState | null>(
        roomKeys.player(gameCode),
        updatePlayerProfile,
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
      void refetchPlayer();
      void refetchDeck();
    }, [
      refetchDeck,
      refetchMeta,
      refetchPlayer,
      refetchPlayers,
    ]),
    onMessage: useCallback(
      (event: MessageEvent<string>) => {
        const message = parsePlayerServerMessage(event.data);
        if (!message) {
          return;
        }

        if (message.type === "player.snapshot") {
          setPlayerState(message.payload);
          void refetchMeta();
          void refetchPlayers();
          return;
        }

        if (message.type === "room.started") {
          void refetchMeta();
          void refetchPlayers();
          void refetchPlayer();
          refreshDeck();
          return;
        }

        if (message.type === "room.completed") {
          void refetchMeta();
          void refetchPlayer();
          void refetchFinale();
          return;
        }

        if (message.type === "room.status_changed") {
          void refetchMeta();
          void refetchPlayers();
          void refetchPlayer();
          refreshDeck();
          void refetchFinale();
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
          setPlayerState((current) =>
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
      [
        notify,
        refetchDeck,
        refetchFinale,
        refetchMeta,
        refetchPlayer,
        refetchPlayers,
        refreshDeck,
        resetRoomSession,
      ],
    ),
  });

  if (
    metaQuery.isLoading ||
    playersQuery.isLoading ||
    playerQuery.isLoading ||
    !playerState
  ) {
    return null;
  }

  if (
    metaQuery.error ||
    playersQuery.error ||
    playerQuery.error ||
    !metaQuery.data ||
    !playersQuery.data
  ) {
    if (
      isMissingRoomSessionError(metaQuery.error) ||
      isMissingRoomSessionError(playersQuery.error) ||
      isMissingRoomSessionError(playerQuery.error)
    ) {
      return null;
    }

    return (
      <RoomUnavailable
        message={
          playerQuery.error instanceof Error
            ? playerQuery.error.message
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
    if (!deckQuery.data?.currentItem) {
      return;
    }

    setGameError(null);
    voteMutation.mutate({
      choice,
      movieId: movieId ?? deckQuery.data.currentItem.movie.id,
      actionId: crypto.randomUUID(),
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
              aria-label={`Copy room code ${playerState.summary.code}`}
              className="font-mono text-sm font-bold tracking-[0.22em] text-primary transition hover:text-[hsl(357_92%_55%)] sm:text-lg"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(playerState.summary.code);
                  setGameError(null);
                } catch {
                  setGameError("Unable to copy room code");
                }
              }}>
              {playerState.summary.code}
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
        deck={deckQuery.data ?? null}
        deckPending={
          deckQuery.isLoading ||
          deckQuery.isFetching ||
          refreshDeckPending ||
          isDeckRefreshQueued
        }
        profilePending={profileMutation.isPending}
        player={playerState}
        finale={finaleQuery.data ?? null}
        finaleVotePending={finaleVoteMutation.isPending}
        onFinaleVote={(movieId) => finaleVoteMutation.mutate(movieId)}
        onPlayerChanged={() => void refetchPlayer()}
        onProfileSubmit={(payload) => profileMutation.mutate(payload)}
        onVote={vote}
      />
    </RoomScreenShell>
  );
}

function PlayerRoomBody({
  isVoting,
  deck,
  deckPending,
  onProfileSubmit,
  onVote,
  player,
  profilePending,
  finale,
  finaleVotePending,
  onFinaleVote,
  onPlayerChanged,
}: {
  deck: PlayerDeckState | null;
  deckPending: boolean;
  isVoting: boolean;
  onProfileSubmit: (payload: {displayName: string; iconId: PlayerIconId}) => void;
  onVote: (choice: SwipeChoice, movieId?: string) => void;
  player: PlayerRoomState;
  profilePending: boolean;
  finale: FinaleState | null;
  finaleVotePending: boolean;
  onFinaleVote: (movieId: string | null) => void;
  onPlayerChanged: () => void;
}) {
  const viewMode = getPlayerRoomViewMode(player.summary.status);

  if (viewMode === "waiting") {
    return (
      <PlayerRoomBodyFrame>
        <div className="w-full max-w-md space-y-4">
          <PlayerProfileEditor
            displayName={player.me.displayName}
            iconId={player.me.iconId}
            pending={profilePending}
            onSubmit={onProfileSubmit}
          />
          <PlayerTastePanel
            taste={player.me.taste}
            onSaved={onPlayerChanged}
          />
          <MovieSuggestionPanel
            remaining={player.me.suggestionRemaining}
            onSuggested={onPlayerChanged}
          />
        </div>
      </PlayerRoomBodyFrame>
    );
  }

  if (viewMode === "finale") {
    return (
      <PlayerRoomBodyFrame>
        <FinaleVotePanel
          finale={finale}
          pending={finaleVotePending}
          onVote={onFinaleVote}
        />
      </PlayerRoomBodyFrame>
    );
  }

  if (viewMode === "completed") {
    return (
      <PlayerRoomBodyFrame>
        <PlayerStatusPanel
          title={finale?.winner ? `${finale.winner.title} wins` : "This round is complete"}
          body={finale?.winner ? "That’s tonight’s pick. Check the display for details." : "Watch the display for the final board and matches."}
        />
      </PlayerRoomBodyFrame>
    );
  }

  if (!deck?.currentItem) {
    if (deckPending) {
      return (
        <PlayerRoomBodyFrame>
          <PlayerDeckLoadingCard />
        </PlayerRoomBodyFrame>
      );
    }

    return (
      <PlayerRoomBodyFrame>
        <PlayerStatusPanel
          title="No movie ready"
          body="New picks are being added to the room. Your next card will appear here."
        />
      </PlayerRoomBodyFrame>
    );
  }

  return (
    <PlayerRoomBodyFrame>
      <div className="w-full max-w-sm space-y-4">
        {deck.currentItem.source === "suggestion" ? (
          <div className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Player suggestion
          </div>
        ) : null}
        <SwipeDeck
          item={deck.currentItem}
          onSwipe={(choice, movieId) => onVote(choice, movieId)}
          disabled={isVoting}
        />
        <SwipeControls
          onSwipe={(choice) => onVote(choice)}
          disabled={isVoting}
        />
        <MovieSuggestionPanel
          remaining={player.me.suggestionRemaining}
          onSuggested={onPlayerChanged}
        />
      </div>
    </PlayerRoomBodyFrame>
  );
}

function FinaleVotePanel({
  finale,
  pending,
  onVote,
}: {
  finale: FinaleState | null;
  pending: boolean;
  onVote: (movieId: string | null) => void;
}) {
  if (!finale) {
    return (
      <PlayerStatusPanel
        title="Finalists incoming"
        body="Watch the display for the reveal."
      />
    );
  }

  if (finale.myVote !== undefined && finale.totalVotes > 0) {
    return (
      <PlayerStatusPanel
        title="Final vote locked in"
        body={`${finale.totalVotes} of ${finale.totalPlayers} players have voted.`}
      />
    );
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose tonight&apos;s movie</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One private final vote.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {finale.finalists.map((movie) => (
          <button
            key={movie.id}
            type="button"
            disabled={pending}
            className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-left transition active:scale-95"
            onClick={() => onVote(movie.id)}>
            <img
              src={movie.posterUrl}
              alt=""
              className="aspect-[2/3] w-full object-cover"
            />
            <span className="block truncate p-2 text-xs font-semibold">
              {movie.title}
            </span>
          </button>
        ))}
      </div>
      <Button
        className="w-full"
        variant="ghost"
        disabled={pending}
        onClick={() => onVote(null)}>
        None of these
      </Button>
    </div>
  );
}

function PlayerDeckLoadingCard() {
  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[0_20px_60px_hsl(0_0%_0%/0.5)]">
        <div className="h-[400px] bg-gradient-to-r from-white/[0.06] via-white/[0.12] to-white/[0.06] bg-[length:200%_100%] animate-[shimmer_1.4s_linear_infinite]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex flex-col items-center gap-3 rounded-xl border border-white/12 bg-black/65 px-4 py-4 text-xs uppercase tracking-[0.18em] text-white"
            role="status"
            aria-live="polite">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-primary" />
            <span className="font-bold text-muted-foreground">Finding your next movie</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
      </div>
    </div>
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
    <div className="flex flex-1 items-center justify-center py-2 sm:py-4">
      {children}
    </div>
  );
}

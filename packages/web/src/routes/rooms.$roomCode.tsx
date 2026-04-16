import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MovieVoteSummary,
  RoomDeckItem,
  RoomServerMessage,
  RoomSnapshot,
  SwipeChoice,
} from "@deckflix/shared";
import { Button, Card, CardContent } from "../components/ui";
import { SwipeControls } from "../components/rooms/swipe-controls";
import { SwipeDeck } from "../components/rooms/swipe-deck";
import { API_BASE_URL, api, throwApiError } from "../lib/api";
import {createRoomWebSocketUrl, parseRoomServerMessage} from "../lib/rooms";

export const Route = createFileRoute("/rooms/$roomCode")({
  component: RoomPage,
});

function RoomPage() {
  const { roomCode } = Route.useParams();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [viewerMemberId, setViewerMemberId] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [latestMatchMovieId, setLatestMatchMovieId] = useState<string | null>(null);
  const [latestCompletedCard, setLatestCompletedCard] = useState<MovieVoteSummary | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const swipeMutation = useMutation({
    mutationFn: async (payload: {movieId: string; choice: SwipeChoice}) => {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomCode}/swipes`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        await throwApiError(response, `POST /api/rooms/${roomCode}/swipes`);
      }
      return response.json();
    },
    onError: (error) => {
      setRoomError(
        error instanceof Error ? error.message : "Unable to record swipe",
      );
    },
  });
  const leaveRoomMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomCode}/leave`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        await throwApiError(response, `POST /api/rooms/${roomCode}/leave`);
      }
    },
  });

  const roomQuery = useQuery({
    queryKey: ["room", roomCode],
    queryFn: async () => {
      const response = await api.api.rooms[":roomCode"].$get({
        param: { roomCode },
      });
      if (!response.ok) {
        await throwApiError(response, `GET /api/rooms/${roomCode}`);
      }
      return (await response.json()) as RoomSnapshot;
    },
  });

  useEffect(() => {
    if (roomQuery.data) {
      setSnapshot(roomQuery.data);
      if (roomQuery.data.viewerMemberId) {
        setViewerMemberId(roomQuery.data.viewerMemberId);
      }
    }
  }, [roomQuery.data]);

  useEffect(() => {
    if (!viewerMemberId) return;

    const socket = new WebSocket(createRoomWebSocketUrl(roomCode));
    socketRef.current = socket;

    socket.onopen = () => {
      setRoomError(null);
    };

    socket.onclose = (event) => {
      if (event.code === 4001) {
        setRoomError("Room session expired or is invalid. Rejoin the room.");
        return;
      }
      if (event.reason) {
        setRoomError(`Room socket closed: ${event.reason}`);
      }
    };

    socket.onerror = () => {
      setRoomError("Room socket error");
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      const message = parseRoomServerMessage(event.data);
      if (!message) return;
      handleServerMessage(message);
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
  }, [roomCode, viewerMemberId]);

  const handleServerMessage = (message: RoomServerMessage) => {
    if (message.type === "room.snapshot") {
      if (message.payload.viewerMemberId) {
        setViewerMemberId(message.payload.viewerMemberId);
      }
      setSnapshot((current) =>
        current
          ? {
              ...message.payload,
              viewerMemberId: current.viewerMemberId ?? message.payload.viewerMemberId,
            }
          : message.payload,
      );
      return;
    }
    if (message.type === "room.card_complete") {
      setLatestCompletedCard(message.payload);
      return;
    }
    if (message.type === "room.match_found") {
      setLatestMatchMovieId(message.payload.movieId);
      return;
    }
    if (message.type === "room.error") {
      setRoomError(message.payload.message);
    }
  };

  const myProgress = snapshot?.deck.memberProgress.find(
    (progress) => progress.memberId === viewerMemberId,
  );
  const currentIndex = myProgress?.currentIndex ?? 0;
  const currentDeckItem: RoomDeckItem | null = snapshot?.deck.items[currentIndex] ?? null;
  const currentMovie = currentDeckItem?.movie ?? null;
  const matchMovie = snapshot?.movies.find((movie) => movie.id === latestMatchMovieId) ?? null;
  const completedMovie =
    snapshot?.movies.find((movie) => movie.id === latestCompletedCard?.movieId) ?? null;
  const totalMembers = snapshot?.members.length ?? 0;
  const canSwipe = totalMembers >= 2 && snapshot?.status !== "lobby";

  const swipe = (choice: SwipeChoice, movieId?: string) => {
    if (!currentMovie || !canSwipe) return;
    setRoomError(null);
    swipeMutation.mutate({
      movieId: movieId ?? currentMovie.id,
      choice,
    });
  };

  if (roomQuery.isLoading) {
    return null;
  }

  if (!viewerMemberId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <h2 className="text-xl font-semibold font-display">No session found</h2>
            <p className="text-sm text-muted-foreground">
              Join or create room <span className="font-mono text-foreground">{roomCode.toUpperCase()}</span> first.
            </p>
            <Link to="/rooms">
              <Button className="w-full">Go to rooms</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Compact room header */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-lg font-bold tracking-tight font-display">
              Deck<span className="text-primary">flix</span>
            </Link>
            <div className="h-4 w-px bg-white/[0.1]" />
            <span className="font-mono text-sm font-semibold tracking-wider text-muted-foreground">
              {roomCode.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{totalMembers} member{totalMembers === 1 ? "" : "s"}</span>
            <span className="text-xs text-muted-foreground">
              {Math.min(currentIndex + 1, snapshot?.deck.totalCards ?? 1)}/{snapshot?.deck.totalCards ?? 1}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await leaveRoomMutation.mutateAsync();
                window.location.href = "/rooms";
              }}
              disabled={leaveRoomMutation.isPending}
            >
              Leave room
            </Button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="mx-auto w-full max-w-3xl px-5">
        {roomError ? (
          <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {roomError}
          </div>
        ) : null}

        {matchMovie ? (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 enter-rise">
            <div className="text-sm font-semibold text-primary">Match found!</div>
            <div className="text-sm text-foreground">{matchMovie.title}</div>
          </div>
        ) : null}

        {latestCompletedCard && completedMovie ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 enter-rise">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Everyone swiped</div>
            <div className="text-sm text-foreground">{completedMovie.title} &mdash; {latestCompletedCard.totalVotes} vote{latestCompletedCard.totalVotes === 1 ? "" : "s"}</div>
          </div>
        ) : null}
      </div>

      {/* Main swipe area */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-6">
        {!canSwipe ? (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-semibold">Waiting for another person to join</p>
            <p className="mt-1 text-sm">Swiping starts once at least 2 members are in the room.</p>
          </div>
        ) : currentMovie ? (
          <div className="w-full max-w-sm space-y-5">
            <SwipeDeck
              items={snapshot?.deck.items ?? []}
              currentIndex={currentIndex}
              onSwipe={(choice, movieId) => swipe(choice, movieId)}
              disabled={swipeMutation.isPending}
            />
            <SwipeControls
              onSwipe={(choice) => swipe(choice)}
              disabled={swipeMutation.isPending}
              allowMaybe={snapshot?.settings.allowMaybe}
              allowSuperLike={snapshot?.settings.allowSuperLike}
            />
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-semibold">
              {roomQuery.isLoading ? "Loading room..." : "No movies in deck"}
            </p>
            <p className="mt-1 text-sm">Waiting for the host to add movies.</p>
          </div>
        )}
      </div>

      {/* Members strip at bottom */}
      {snapshot?.members && snapshot.members.length > 0 ? (
        <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3 overflow-x-auto">
            {snapshot.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-xs whitespace-nowrap"
              >
                <span className="text-foreground">{member.displayName}</span>
                {member.role === "host" ? (
                  <span className="text-primary/70 text-[10px] font-semibold uppercase">host</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

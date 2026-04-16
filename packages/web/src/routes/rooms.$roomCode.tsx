import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  RoomDeckItem,
  RoomServerMessage,
  RoomSnapshot,
  SwipeRoomPayload,
  SwipeChoice,
  MovieVoteSummary,
} from "@deckflix/shared";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../components/ui";
import { SwipeControls } from "../components/rooms/swipe-controls";
import { SwipeDeck } from "../components/rooms/swipe-deck";
import { api } from "../lib/api";
import {
  createRoomWebSocketUrl,
  getRoomSession,
  parseRoomServerMessage,
} from "../lib/rooms";

export const Route = createFileRoute("/rooms/$roomCode")({
  component: RoomPage,
});

function RoomPage() {
  const { roomCode } = Route.useParams();
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">(
    "connecting",
  );
  const [roomError, setRoomError] = useState<string | null>(null);
  const [latestMatchMovieId, setLatestMatchMovieId] = useState<string | null>(null);
  const [latestCompletedCard, setLatestCompletedCard] = useState<MovieVoteSummary | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const roomSession = useMemo(() => getRoomSession(roomCode), [roomCode]);
  const swipeMutation = useMutation({
    mutationFn: async (payload: SwipeRoomPayload) => {
      const response = await api.api.rooms[":roomCode"].swipes.$post({
        param: { roomCode },
        json: payload,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    onError: (error) => {
      setRoomError(
        error instanceof Error ? error.message : "Unable to record swipe",
      );
    },
  });

  const roomQuery = useQuery({
    queryKey: ["room", roomCode],
    queryFn: async () => {
      const response = await api.api.rooms[":roomCode"].$get({
        param: { roomCode },
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as RoomSnapshot;
    },
  });

  useEffect(() => {
    setSessionLoaded(true);
  }, []);

  useEffect(() => {
    if (roomQuery.data) {
      setSnapshot(roomQuery.data);
    }
  }, [roomQuery.data]);

  useEffect(() => {
    if (!roomSession) return;

    setSocketState("connecting");
    const socket = new WebSocket(createRoomWebSocketUrl(roomSession));
    socketRef.current = socket;

    socket.onopen = () => {
      setSocketState("open");
      setRoomError(null);
    };

    socket.onclose = () => {
      setSocketState("closed");
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
      socket.close();
      socketRef.current = null;
    };
  }, [roomSession]);

  const handleServerMessage = (message: RoomServerMessage) => {
    if (message.type === "room.snapshot") {
      setSnapshot(message.payload);
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
    (progress) => progress.memberId === roomSession?.memberId,
  );
  const currentIndex = myProgress?.currentIndex ?? 0;
  const currentDeckItem: RoomDeckItem | null = snapshot?.deck.items[currentIndex] ?? null;
  const currentMovie = currentDeckItem?.movie ?? null;
  const matchMovie = snapshot?.movies.find((movie) => movie.id === latestMatchMovieId) ?? null;
  const completedMovie =
    snapshot?.movies.find((movie) => movie.id === latestCompletedCard?.movieId) ?? null;

  const swipe = (choice: SwipeChoice, movieId?: string) => {
    if (!currentMovie || !roomSession) return;
    setRoomError(null);
    swipeMutation.mutate({
      memberId: roomSession.memberId,
      sessionToken: roomSession.sessionToken,
      movieId: movieId ?? currentMovie.id,
      choice,
    });
  };

  if (!sessionLoaded) {
    return null;
  }

  if (!roomSession) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Room Session Found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Join or create room {roomCode.toUpperCase()} first so this browser has room access.
          </p>
          <Link to="/rooms">
            <Button>Go to rooms</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">Room {roomCode.toUpperCase()}</h2>
          <p className="text-sm text-muted-foreground">
            Connection: {socketState} | Status: {snapshot?.status ?? "loading"} | Card{" "}
            {Math.min(currentIndex + 1, snapshot?.deck.totalCards ?? 1)}/
            {snapshot?.deck.totalCards ?? 1}
          </p>
        </div>
        <Link to="/rooms">
          <Button variant="outline">Switch room</Button>
        </Link>
      </section>

      {roomError ? (
        <Card className="border-danger/40">
          <CardContent className="text-sm text-danger">{roomError}</CardContent>
        </Card>
      ) : null}

      {matchMovie ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Match Found: {matchMovie.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {matchMovie.overview}
          </CardContent>
        </Card>
      ) : null}

      {latestCompletedCard && completedMovie ? (
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>Everyone Swiped: {completedMovie.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {latestCompletedCard.totalVotes} vote
            {latestCompletedCard.totalVotes === 1 ? "" : "s"} recorded.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Swipe Deck</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentMovie ? (
              <>
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
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {roomQuery.isLoading ? "Loading room..." : "No movies in this room yet."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot?.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between text-sm">
                <span>
                  {member.displayName} {member.role === "host" ? "(Host)" : ""}
                </span>
                <span className={member.connected ? "text-primary" : "text-muted-foreground"}>
                  {member.connected ? "online" : "offline"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

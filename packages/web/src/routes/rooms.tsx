import { useState } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
} from "@deckflix/shared";
import { Button, Card, CardContent, Input, Label } from "../components/ui";
import { api, throwApiError } from "../lib/api";

export const Route = createFileRoute("/rooms")({
  component: RoomsLandingPage,
});

function RoomsLandingPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [mode, setMode] = useState<"pick" | "create" | "join">("pick");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const createRoomMutation = useMutation({
    mutationFn: async (payload: CreateRoomPayload) => {
      const response = await api.api.rooms.$post({ json: payload });
      if (!response.ok) {
        await throwApiError(response, "POST /api/rooms");
      }
      return response.json();
    },
    onSuccess: (result) => {
      navigate({
        to: "/rooms/$roomCode",
        params: { roomCode: result.room.code },
      });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (payload: { roomCode: string; body: JoinRoomPayload }) => {
      const response = await api.api.rooms[":roomCode"].join.$post({
        param: { roomCode: payload.roomCode.toUpperCase() },
        json: payload.body,
      });
      if (!response.ok) {
        await throwApiError(
          response,
          `POST /api/rooms/${payload.roomCode.toUpperCase()}/join`,
        );
      }
      return response.json();
    },
    onSuccess: (result) => {
      navigate({
        to: "/rooms/$roomCode",
        params: { roomCode: result.room.code },
      });
    },
  });

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createDisplayName.trim()) return;
    createRoomMutation.mutate({ displayName: createDisplayName.trim() });
  };

  const submitJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!joinDisplayName.trim() || !roomCode.trim()) return;
    joinRoomMutation.mutate({
      roomCode: roomCode.trim(),
      body: { displayName: joinDisplayName.trim() },
    });
  };

  if (pathname !== "/rooms") {
    return <Outlet />;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <Link to="/" className="mb-10 text-2xl font-bold tracking-tight font-display enter-rise">
        Deck<span className="text-primary">flix</span>
      </Link>

      {mode === "pick" ? (
        <div className="enter-rise enter-delay-1 flex w-full max-w-sm flex-col gap-3">
          <Button
            size="lg"
            effect="glow"
            className="w-full text-base"
            onClick={() => setMode("create")}
          >
            Create a room
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full text-base"
            onClick={() => setMode("join")}
          >
            Join with code
          </Button>
        </div>
      ) : null}

      {mode === "create" ? (
        <Card className="enter-rise w-full max-w-sm">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold font-display">Create a room</h2>
              <button
                onClick={() => setMode("pick")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            </div>
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName-create">Your name</Label>
                <Input
                  id="displayName-create"
                  value={createDisplayName}
                  onChange={(event) => setCreateDisplayName(event.target.value)}
                  placeholder="What should we call you?"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                effect="glow"
                className="w-full"
                disabled={createRoomMutation.isPending}
              >
                {createRoomMutation.isPending ? "Creating..." : "Create room"}
              </Button>
            </form>
            {createRoomMutation.error ? (
              <p className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger">
                {createRoomMutation.error instanceof Error
                  ? createRoomMutation.error.message
                  : "Unable to create room"}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {mode === "join" ? (
        <Card className="enter-rise w-full max-w-sm">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold font-display">Join a room</h2>
              <button
                onClick={() => setMode("pick")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            </div>
            <form onSubmit={submitJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomCode">Room code</Label>
                <Input
                  id="roomCode"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  className="text-center text-xl font-mono tracking-[0.3em] uppercase"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName-join">Your name</Label>
                <Input
                  id="displayName-join"
                  value={joinDisplayName}
                  onChange={(event) => setJoinDisplayName(event.target.value)}
                  placeholder="What should we call you?"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={joinRoomMutation.isPending}
              >
                {joinRoomMutation.isPending ? "Joining..." : "Join room"}
              </Button>
            </form>
            {joinRoomMutation.error ? (
              <p className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-sm text-danger">
                {joinRoomMutation.error instanceof Error
                  ? joinRoomMutation.error.message
                  : "Unable to join room"}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

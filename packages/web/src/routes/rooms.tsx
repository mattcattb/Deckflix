import {useState} from "react";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {useMutation} from "@tanstack/react-query";
import type {
  CreateRoomPayload,
  CreateRoomResult,
  JoinRoomPayload,
  JoinRoomResult,
} from "@deckflix/shared";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "../components/ui";
import {api} from "../lib/api";
import {saveRoomSession} from "../lib/rooms";

export const Route = createFileRoute("/rooms")({
  component: RoomsLandingPage,
});

function RoomsLandingPage() {
  const navigate = useNavigate();
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const createRoomMutation = useMutation({
    mutationFn: async (payload: CreateRoomPayload) => {
      const response = await api.api.rooms.$post({json: payload});
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as CreateRoomResult;
    },
    onSuccess: (result) => {
      saveRoomSession(result.session);
      navigate({
        to: "/rooms/$roomCode",
        params: {roomCode: result.room.code},
      });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (payload: {roomCode: string; body: JoinRoomPayload}) => {
      const response = await api.api.rooms[":roomCode"].join.$post({
        param: {roomCode: payload.roomCode.toUpperCase()},
        json: payload.body,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as JoinRoomResult;
    },
    onSuccess: (result) => {
      saveRoomSession(result.session);
      navigate({
        to: "/rooms/$roomCode",
        params: {roomCode: result.room.code},
      });
    },
  });

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createDisplayName.trim()) return;
    createRoomMutation.mutate({
      displayName: createDisplayName.trim(),
    });
  };

  const submitJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!joinDisplayName.trim() || !roomCode.trim()) return;
    joinRoomMutation.mutate({
      roomCode: roomCode.trim(),
      body: {
        displayName: joinDisplayName.trim(),
      },
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Create A Room</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="displayName-create">Your name</Label>
              <Input
                id="displayName-create"
                value={createDisplayName}
                onChange={(event) => setCreateDisplayName(event.target.value)}
                placeholder="Movie Captain"
              />
            </div>
            <Button type="submit" disabled={createRoomMutation.isPending}>
              {createRoomMutation.isPending ? "Creating..." : "Create room"}
            </Button>
          </form>
          {createRoomMutation.error ? (
            <p className="text-sm text-danger">
              {createRoomMutation.error instanceof Error
                ? createRoomMutation.error.message
                : "Unable to create room"}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Join A Room</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitJoin} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="displayName-join">Your name</Label>
              <Input
                id="displayName-join"
                value={joinDisplayName}
                onChange={(event) => setJoinDisplayName(event.target.value)}
                placeholder="Movie Captain"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roomCode">Room code</Label>
              <Input
                id="roomCode"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                placeholder="AB12CD"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={joinRoomMutation.isPending}>
              {joinRoomMutation.isPending ? "Joining..." : "Join room"}
            </Button>
          </form>
          {joinRoomMutation.error ? (
            <p className="text-sm text-danger">
              {joinRoomMutation.error instanceof Error
                ? joinRoomMutation.error.message
                : "Unable to join room"}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

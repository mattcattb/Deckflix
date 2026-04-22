import {useState} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";
import {
  gameKeys,
  normalizeGameCode,
  roomMetaQueryOptions,
  roomPlayersQueryOptions,
} from "../../lib/games";
import {Button, Card, CardContent, Input, Label} from "../../components/ui";
import {RoomUnavailable} from "./room-unavailable";

export function JoinRoomView({gameCode}: {gameCode: string}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const metaQuery = useQuery(roomMetaQueryOptions(gameCode));
  const playersQuery = useQuery(roomPlayersQueryOptions(gameCode));

  const joinGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.rooms[":gameCode"].players.$post({
          param: {gameCode: normalizeGameCode(gameCode)},
          json: {
            displayName: displayName.trim(),
          },
        }),
      ),
    onSuccess: () => {
      setDisplayName("");
      queryClient.removeQueries({queryKey: gameKeys.activeClient, exact: true});
      navigate({to: "/play"});
    },
  });

  if (metaQuery.isLoading || playersQuery.isLoading) {
    return null;
  }

  if (
    metaQuery.error ||
    playersQuery.error ||
    !metaQuery.data ||
    !playersQuery.data
  ) {
    return (
      <RoomUnavailable
        message={
          metaQuery.error instanceof Error
            ? metaQuery.error.message
            : playersQuery.error instanceof Error
              ? playersQuery.error.message
              : "This room is not available."
        }
      />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Link to="/" className="text-lg font-bold tracking-tight font-display">
            DECK<span className="flame-text">FLIX</span>
          </Link>
          <div className="font-mono text-5xl font-bold tracking-[0.35em] text-foreground md:text-6xl">
            {metaQuery.data.summary.code}
          </div>
          {metaQuery.data.summary.roomName ? (
            <p className="text-sm text-muted-foreground">
              {metaQuery.data.summary.roomName}
            </p>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {playersQuery.data.players.length} player
            {playersQuery.data.players.length === 1 ? "" : "s"} in room
          </span>
        </div>

        <Card className="border-white/[0.06] bg-black/40">
          <CardContent className="space-y-4 p-6">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!displayName.trim()) {
                  return;
                }

                joinGameMutation.mutate();
              }}>
              <div className="space-y-2">
                <Label htmlFor="room-display-name">Your name</Label>
                <Input
                  id="room-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="What should the room call you?"
                  autoFocus
                />
              </div>

              <Button
                effect="glow"
                className="w-full"
                type="submit"
                disabled={joinGameMutation.isPending}>
                {joinGameMutation.isPending ? "Joining..." : "Join game"}
              </Button>
            </form>

            {joinGameMutation.error ? (
              <p className="rounded-lg border border-swipe-nope/20 bg-swipe-nope/10 px-3 py-2 text-sm text-swipe-nope">
                {joinGameMutation.error instanceof Error
                  ? joinGameMutation.error.message
                  : "Unable to join game"}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

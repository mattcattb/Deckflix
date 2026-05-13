import {useState} from "react";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {
  createRandomUserName,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
} from "@deckflix/shared";
import {BrandMark, StatusMessage} from "../components/common";
import {CenteredPanel} from "../components/layout";
import {Button, Card, CardContent, Input, Label} from "../components/ui";
import {api, parseRpc} from "../lib/api";
import {
  activeRoomSessionKeys,
  normalizeGameCode,
  storePlayerSessionToken,
} from "../features/room/room-session";
import {requireNoActiveRoom} from "./room-route-guards";

export const Route = createFileRoute("/join/$gameCode")({
  beforeLoad: ({context}) => requireNoActiveRoom(context.activeClient),
  loader: async ({params}) => {
    const gameCode = normalizeGameCode(params.gameCode);
    return {gameCode};
  },
  component: JoinRoomPage,
});

function JoinRoomPage() {
  const {gameCode} = Route.useLoaderData();
  return <JoinRoomView gameCode={gameCode} />;
}

function JoinRoomView({gameCode}: {gameCode: string}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suggestedDisplayName] = useState(() => createRandomUserName());
  const [displayName, setDisplayName] = useState("");
  const normalizedGameCode = normalizeGameCode(gameCode);

  const joinGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.room[":gameCode"].join.$post({
          param: {gameCode: normalizedGameCode},
          json: {
            displayName: displayName.trim() || suggestedDisplayName,
          },
        }),
      ),
    onSuccess: (result) => {
      storePlayerSessionToken(result.playerSession);
      setDisplayName("");
      queryClient.removeQueries({
        queryKey: activeRoomSessionKeys.activeClient,
        exact: true,
      });
      navigate({to: "/play"});
    },
  });

  return (
    <CenteredPanel>
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <BrandMark to="/" size="sm" uppercase />
          <div className="font-mono text-5xl font-bold tracking-[0.35em] text-foreground md:text-6xl">
            {normalizedGameCode}
          </div>
        </div>

        <Card className="border-white/[0.06] bg-black/40">
          <CardContent className="space-y-4 p-6">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                joinGameMutation.mutate();
              }}>
              <div className="space-y-2">
                <Label htmlFor="room-display-name">Your name</Label>
                <Input
                  id="room-display-name"
                  maxLength={PLAYER_DISPLAY_NAME_MAX_LENGTH}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={suggestedDisplayName}
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
              <StatusMessage tone="danger" className="rounded-lg px-3 py-2">
                {joinGameMutation.error instanceof Error
                  ? joinGameMutation.error.message
                  : "Unable to join game"}
              </StatusMessage>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </CenteredPanel>
  );
}

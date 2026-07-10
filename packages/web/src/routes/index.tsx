import {useState} from "react";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Loader2, MonitorPlay, Smartphone} from "lucide-react";
import {
  createRandomRoomName,
  createRandomUserName,
  GAME_CODE_LENGTH,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
} from "@deckflix/shared";
import {api, parseRpc} from "../lib/api";
import {BrandMark} from "../components/common";
import {CenteredPanel} from "../components/layout";
import {
  Button,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "../components/ui";
import {
  activeRoomSessionKeys,
  normalizeGameCode,
  storeDisplaySessionToken,
  storePlayerSessionToken,
} from "../features/room/room-session";
import {requireNoActiveRoom} from "./-room-route-guards";

export const Route = createFileRoute("/")({
  beforeLoad: ({context}) => requireNoActiveRoom(context.activeClient),
  component: HomePage,
});

type HomeMode = "display" | "play";

function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {notify} = useToast();
  const [mode, setMode] = useState<HomeMode>("play");
  const [suggestedRoomName] = useState(() => createRandomRoomName());
  const [suggestedDisplayName] = useState(() => createRandomUserName());
  const [roomName, setRoomName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  const createGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.room.$post({
          json: {
            roomName: roomName.trim() || suggestedRoomName,
          },
        }),
      ),
    onSuccess: (result) => {
      storeDisplaySessionToken(result.displaySession);
      queryClient.removeQueries({
        queryKey: activeRoomSessionKeys.activeClient,
        exact: true,
      });
      navigate({to: "/room"});
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Couldn’t create room",
        description: getErrorMessage(error),
      });
    },
  });

  const joinGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.room[":gameCode"].join.$post({
          param: {gameCode: normalizeGameCode(gameCode)},
          json: {
            displayName: displayName.trim() || suggestedDisplayName,
          },
        }),
      ),
    onSuccess: (result) => {
      storePlayerSessionToken(result.playerSession);
      queryClient.removeQueries({
        queryKey: activeRoomSessionKeys.activeClient,
        exact: true,
      });
      navigate({to: "/play"});
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Couldn’t join room",
        description: getErrorMessage(error),
      });
    },
  });

  return (
    <CenteredPanel>
      <div className="enter-rise relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(160deg,hsl(0_0%_8%)_0%,hsl(0_0%_4%)_100%)] shadow-[0_12px_48px_hsl(0_0%_0%/0.6)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,hsl(0_80%_48%/0.12),transparent_60%)]" />

        <div className="relative space-y-6 p-6 md:p-8">
          <div className="space-y-3 text-center">
            <h1>
              <BrandMark size="lg" uppercase />
            </h1>
            <p className="text-sm text-muted-foreground">
              Swipe right on movie night
            </p>
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value as HomeMode)}>
            <TabsList className="grid h-auto w-full grid-cols-2 p-1.5">
              <TabsTrigger className="gap-2 py-2.5" value="play">
                <Smartphone />
                Join
              </TabsTrigger>
              <TabsTrigger className="gap-2 py-2.5" value="display">
                <MonitorPlay />
                Display
              </TabsTrigger>
            </TabsList>

            <TabsContent value="play">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  normalizeGameCode(gameCode).length !== GAME_CODE_LENGTH
                ) {
                  notify({
                    type: "error",
                    title: "Couldn’t join room",
                    description: `Enter a ${GAME_CODE_LENGTH}-character room code first.`,
                  });
                  return;
                }

                joinGameMutation.mutate();
              }}>
              <div className="space-y-2">
                <Label htmlFor="gameCode">Room code</Label>
                <InputOTP
                  id="gameCode"
                  maxLength={GAME_CODE_LENGTH}
                  value={gameCode}
                  onChange={(value) => setGameCode(normalizeGameCode(value))}
                  containerClassName="justify-center"
                  autoFocus
                >
                  <InputOTPGroup>
                    {Array.from({length: GAME_CODE_LENGTH}).map((_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Your name</Label>
                <Input
                  id="displayName"
                  maxLength={PLAYER_DISPLAY_NAME_MAX_LENGTH}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={suggestedDisplayName}
                />
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={
                  joinGameMutation.isPending ||
                  normalizeGameCode(gameCode).length !== GAME_CODE_LENGTH
                }>
                {joinGameMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Joining room...
                  </>
                ) : (
                  "Join room"
                )}
              </Button>
            </form>
            </TabsContent>

            <TabsContent value="display">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createGameMutation.mutate();
              }}>
              <div className="space-y-2">
                <Label htmlFor="roomName">Room name</Label>
                <Input
                  id="roomName"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder={suggestedRoomName}
                  autoFocus
                />
              </div>

              <Button
                effect="glow"
                className="w-full"
                type="submit"
                disabled={createGameMutation.isPending}>
                {createGameMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Creating room...
                  </>
                ) : (
                  "Create room"
                )}
              </Button>
            </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </CenteredPanel>
  );
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Unable to continue";
}

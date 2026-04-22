import {useState} from "react";
import {createFileRoute, redirect, useNavigate} from "@tanstack/react-router";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {GAME_CODE_LENGTH} from "@deckflix/shared";
import {api, parseRpc} from "../lib/api";
import {Button, Input, Label, useToast} from "../components/ui";
import {
  activeRoomClientQueryOptions,
  gameKeys,
  getActiveRoomPath,
  normalizeGameCode,
} from "../lib/games";

export const Route = createFileRoute("/")({
  beforeLoad: async ({context}) => {
    const activeClient = await context.queryClient.ensureQueryData(
      activeRoomClientQueryOptions,
    );

    if (activeClient.role !== "none") {
      throw redirect({
        to: getActiveRoomPath(activeClient),
        replace: true,
      });
    }
  },
  component: HomePage,
});

type HomeMode = "display" | "play";

function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {notify} = useToast();
  const [mode, setMode] = useState<HomeMode>("play");
  const [roomName, setRoomName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  const createGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.room.$post({
          json: {
            roomName: roomName.trim() || undefined,
          },
        }),
      ),
    onSuccess: () => {
      queryClient.removeQueries({queryKey: gameKeys.activeClient, exact: true});
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
            displayName: displayName.trim(),
          },
        }),
      ),
    onSuccess: () => {
      queryClient.removeQueries({queryKey: gameKeys.activeClient, exact: true});
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
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="enter-rise relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(160deg,hsl(0_0%_8%)_0%,hsl(0_0%_4%)_100%)] shadow-[0_12px_48px_hsl(0_0%_0%/0.6)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,hsl(0_80%_48%/0.12),transparent_60%)]" />

        <div className="relative space-y-6 p-6 md:p-8">
          <div className="space-y-3 text-center">
            <h1 className="text-5xl font-bold tracking-tight font-display">
              DECK<span className="flame-text">FLIX</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Swipe right on movie night
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
            <button
              type="button"
              onClick={() => setMode("play")}
              className={
                mode === "play"
                  ? "flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-flame-start to-flame-mid px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_12px_hsl(4_90%_58%/0.3)] transition-all"
                  : "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
              }>
              <PhoneIcon />
              Join
            </button>
            <button
              type="button"
              onClick={() => setMode("display")}
              className={
                mode === "display"
                  ? "flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-flame-start to-flame-mid px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_12px_hsl(4_90%_58%/0.3)] transition-all"
                  : "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
              }>
              <TvIcon />
              Display
            </button>
          </div>

          {mode === "play" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  normalizeGameCode(gameCode).length !== GAME_CODE_LENGTH ||
                  !displayName.trim()
                ) {
                  notify({
                    type: "error",
                    title: "Couldn’t join room",
                    description: `Enter a ${GAME_CODE_LENGTH}-character room code and your name first.`,
                  });
                  return;
                }

                joinGameMutation.mutate();
              }}>
              <div className="space-y-2">
                <Label htmlFor="gameCode">Room code</Label>
                <Input
                  id="gameCode"
                  value={gameCode}
                  onChange={(event) =>
                    setGameCode(normalizeGameCode(event.target.value))
                  }
                  placeholder="ABCD"
                  maxLength={GAME_CODE_LENGTH}
                  className="text-center text-xl font-mono tracking-[0.3em] uppercase"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Your name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="What should the room call you?"
                />
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={
                  joinGameMutation.isPending ||
                  normalizeGameCode(gameCode).length !== GAME_CODE_LENGTH ||
                  !displayName.trim()
                }>
                {joinGameMutation.isPending ? "Joining room..." : "Join room"}
              </Button>
            </form>
          ) : (
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
                  placeholder="Friday Night Picks"
                  autoFocus
                />
              </div>

              <Button
                effect="glow"
                className="w-full"
                type="submit"
                disabled={createGameMutation.isPending}>
                {createGameMutation.isPending
                  ? "Creating room..."
                  : "Create room"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
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

function TvIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

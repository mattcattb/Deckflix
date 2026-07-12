import {useEffect, useRef, useState} from "react";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Loader2,
  MonitorPlay,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import {
  createRandomRoomName,
  createRandomUserName,
  GAME_CODE_LENGTH,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
} from "@deckflix/shared";
import {api, getRpcErrorMessage, parseRpc} from "../lib/api";
import {BrandMark, DataAttribution} from "../components/common";
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
import {captureProductEvent} from "../lib/telemetry";

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
  const didTrackLandingRef = useRef(false);

  useEffect(() => {
    if (didTrackLandingRef.current) return;
    didTrackLandingRef.current = true;
    captureProductEvent("landing_viewed");
  }, []);

  const createGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.room.$post({
          json: {roomName: roomName.trim() || suggestedRoomName},
        }),
      ),
    onMutate: () => captureProductEvent("room_create_started"),
    onSuccess: (result) => {
      captureProductEvent("room_create_succeeded");
      storeDisplaySessionToken(result.displaySession);
      queryClient.removeQueries({
        queryKey: activeRoomSessionKeys.activeClient,
        exact: true,
      });
      navigate({to: "/room"});
    },
    onError: (error) => {
      captureProductEvent("room_create_failed");
      notify({
        type: "error",
        title: "Couldn’t create room",
        description: getRpcErrorMessage(error, "Unable to create a room"),
      });
    },
  });

  const joinGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.room[":gameCode"].join.$post({
          param: {gameCode: normalizeGameCode(gameCode)},
          json: {displayName: displayName.trim() || suggestedDisplayName},
        }),
      ),
    onMutate: () => captureProductEvent("room_join_started"),
    onSuccess: (result) => {
      captureProductEvent("room_join_succeeded");
      storePlayerSessionToken(result.playerSession);
      queryClient.removeQueries({
        queryKey: activeRoomSessionKeys.activeClient,
        exact: true,
      });
      navigate({to: "/play"});
    },
    onError: (error) => {
      captureProductEvent("room_join_failed");
      notify({
        type: "error",
        title: "Couldn’t join room",
        description: getRpcErrorMessage(error, "Unable to join this room"),
      });
    },
  });

  return (
    <main className="min-h-screen overflow-hidden bg-black">
      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark size="md" />
        <button
          type="button"
          className="text-sm font-semibold text-white/65 transition hover:text-white"
          onClick={() => {
            setMode("play");
            document.getElementById("get-started")?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }}>
          Join a room
        </button>
      </nav>

      <section className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:py-16">
        <div className="pointer-events-none absolute -left-48 top-0 h-[34rem] w-[34rem] rounded-full bg-primary/15 blur-[130px]" />
        <div className="relative z-10 max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Movie night, decided together
          </div>
          <h1 className="text-balance text-5xl font-black leading-[0.95] tracking-[-0.045em] sm:text-7xl">
            Stop scrolling.
            <span className="mt-2 block flame-text">Start agreeing.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60 sm:text-xl">
            Everyone swipes on their own phone. Deckflix learns the room,
            surfaces the strongest matches, and helps your group make the final call.
          </p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
            {[
              "No account required",
              "Personalized group picks",
              "Built for phones + TV",
            ].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-swipe-like" />
                {item}
              </span>
            ))}
          </div>

          <div className="mt-10 hidden grid-cols-3 gap-4 sm:grid">
            {[
              ["Pick a vibe", "The host sets tonight’s mood and services."],
              ["Swipe together", "Each deck adapts without revealing votes."],
              ["Make the call", "The best-tested picks reach a final vote."],
            ].map(([title, body], index) => (
              <div key={title} className="border-l border-white/15 pl-4">
                <div className="text-xs font-bold text-primary">0{index + 1}</div>
                <div className="mt-1 font-semibold">{title}</div>
                <p className="mt-1 text-xs leading-relaxed text-white/45">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="get-started" className="relative z-10 scroll-mt-8">
          <div className="pointer-events-none absolute -inset-10 bg-[radial-gradient(circle,hsl(var(--primary)/0.16),transparent_65%)] blur-2xl" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(160deg,hsl(0_0%_10%)_0%,hsl(0_0%_3%)_100%)] shadow-[0_32px_100px_hsl(0_0%_0%/0.75)]">
            <div className="border-b border-white/[0.07] p-6">
              <h2 className="text-2xl font-bold">Ready for movie night?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Join the group on your phone or start the shared display.
              </p>
            </div>
            <div className="p-6">
              <Tabs value={mode} onValueChange={(value) => setMode(value as HomeMode)}>
                <TabsList className="grid h-auto w-full grid-cols-2 p-1.5">
                  <TabsTrigger className="gap-2 py-2.5" value="play">
                    <Smartphone /> Join
                  </TabsTrigger>
                  <TabsTrigger className="gap-2 py-2.5" value="display">
                    <MonitorPlay /> Host
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="play">
                  <form
                    className="space-y-4 pt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (normalizeGameCode(gameCode).length !== GAME_CODE_LENGTH) {
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
                        autoFocus>
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
                        <><Loader2 className="animate-spin" /> Joining room...</>
                      ) : (
                        <>Join room <ArrowRight /></>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="display">
                  <form
                    className="space-y-4 pt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createGameMutation.mutate();
                    }}>
                    <div className="space-y-2">
                      <Label htmlFor="roomName">Movie-night name</Label>
                      <Input
                        id="roomName"
                        value={roomName}
                        onChange={(event) => setRoomName(event.target.value)}
                        placeholder={suggestedRoomName}
                        autoFocus
                      />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-xs leading-relaxed text-white/50">
                      Open this on the shared TV or laptop. Friends join by QR code—no downloads or accounts.
                    </div>
                    <Button
                      effect="glow"
                      className="w-full"
                      type="submit"
                      disabled={createGameMutation.isPending}>
                      {createGameMutation.isPending ? (
                        <><Loader2 className="animate-spin" /> Creating room...</>
                      ) : (
                        <>Start movie night <ArrowRight /></>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.07] bg-white/[0.025] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Built for actual groups</div>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-bold sm:text-5xl">
            Recommendations that understand the room—not just one person.
          </h2>
          <div className="mt-12 grid gap-4 text-left md:grid-cols-3">
            {[
              {icon: Users, title: "Private taste check", body: "Everyone shares moods, genres, and a few favorites without negotiating in front of the group."},
              {icon: Sparkles, title: "Adaptive discovery", body: "Strong signals move through the room while every player still gets a varied, personal order."},
              {icon: MonitorPlay, title: "A confident finale", body: "The TV reveals a well-tested shortlist and explains why each movie earned its place."},
            ].map(({icon: Icon, title, body}) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-black p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <BrandMark size="sm" />
          <p className="mt-2 text-sm text-white/45">Swipe right on movie night.</p>
        </div>
        <DataAttribution className="max-w-lg md:text-right" includeJustWatch />
      </footer>
    </main>
  );
}

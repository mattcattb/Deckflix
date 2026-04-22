import {useEffect, useState} from "react";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {useMutation, useQuery} from "@tanstack/react-query";
import {api, parseRpc} from "../lib/api";
import {Button, Checkbox, Input, Label} from "../components/ui";
import {
  gameKeys,
  getActiveRoomClient,
} from "../lib/games";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type HomeMode = "display" | "play";

function HomePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<HomeMode>("display");
  const [roomName, setRoomName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);

  const activeSessionQuery = useQuery({
    queryKey: gameKeys.activeClient,
    queryFn: getActiveRoomClient,
  });

  const settingsDefaultsQuery = useQuery({
    queryKey: gameKeys.settingsDefaults,
    queryFn: () => parseRpc(api.api.settings.game.$get()),
    staleTime: 1000 * 60 * 10,
  });

  const movieGenresQuery = useQuery({
    queryKey: gameKeys.movieGenres(),
    queryFn: () =>
      parseRpc(
        api.api.settings.game["movie-genres"].$get({
          query: {language: "en-US"},
        }),
      ),
    staleTime: 1000 * 60 * 60,
  });

  useEffect(() => {
    if (activeSessionQuery.data?.role === "none") {
      return;
    }

    if (activeSessionQuery.data) {
      navigate({
        to: activeSessionQuery.data.role === "display" ? "/room" : "/play",
        replace: true,
      });
    }
  }, [activeSessionQuery.data, navigate]);

  useEffect(() => {
    if (!settingsDefaultsQuery.data) {
      return;
    }

    setSelectedGenreIds((current) =>
      current.length > 0
        ? current
        : settingsDefaultsQuery.data.defaults.selectedGenreIds ?? [],
    );
  }, [settingsDefaultsQuery.data]);

  const createGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.games.$post({
          json: {
            roomName: roomName.trim() || undefined,
            settings: {
              selectedGenreIds,
            },
          },
        }),
      ),
    onSuccess: () => {
      navigate({
        to: "/room",
      });
    },
  });

  const joinGameMutation = useMutation({
    mutationFn: async () =>
      parseRpc(
        api.api.rooms[":gameCode"].players.$post({
          param: {gameCode: gameCode.trim().toUpperCase()},
          json: {
            displayName: displayName.trim(),
          },
        }),
      ),
    onSuccess: () => {
      navigate({
        to: "/play",
      });
    },
  });

  const error =
    mode === "display" ? createGameMutation.error : joinGameMutation.error;

  const toggleGenreId = (genreId: number, checked: boolean) => {
    setSelectedGenreIds((current) =>
      checked ? [...new Set([...current, genreId])] : current.filter((id) => id !== genreId),
    );
  };

  if (activeSessionQuery.isLoading) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="enter-rise relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(160deg,hsl(0_0%_8%)_0%,hsl(0_0%_4%)_100%)] shadow-[0_12px_48px_hsl(0_0%_0%/0.6)]">
        {/* Netflix-red ambient glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,hsl(0_80%_48%/0.12),transparent_60%)]" />

        <div className="relative space-y-6 p-6 md:p-8">
          {/* Logo + tagline */}
          <div className="space-y-3 text-center">
            <h1 className="text-5xl font-bold tracking-tight font-display">
              DECK<span className="flame-text">FLIX</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Swipe right on movie night
            </p>
          </div>

          {/* Mode toggle — Tinder-style pill switcher */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
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
            <button
              type="button"
              onClick={() => setMode("play")}
              className={
                mode === "play"
                  ? "flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-flame-start to-flame-mid px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_12px_hsl(4_90%_58%/0.3)] transition-all"
                  : "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
              }>
              <PhoneIcon />
              Play
            </button>
          </div>

          {mode === "display" ? (
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

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Genres</Label>
                  {selectedGenreIds.length > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                      onClick={() => setSelectedGenreIds([])}>
                      Clear
                    </button>
                  ) : null}
                </div>

                {movieGenresQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading genres...</p>
                ) : movieGenresQuery.error ? (
                  <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {movieGenresQuery.error instanceof Error
                      ? movieGenresQuery.error.message
                      : "Unable to load genres"}
                  </p>
                ) : (
                  <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    {movieGenresQuery.data?.items.map((genre: {id: number; name: string}) => (
                      <Checkbox
                        key={genre.id}
                        checked={selectedGenreIds.includes(genre.id)}
                        onCheckedChange={(checked) =>
                          toggleGenreId(genre.id, checked === true)
                        }
                        label={genre.name}
                      />
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Leave blank to pull from the broader movie pool.
                </p>
              </div>

              <Button
                effect="glow"
                className="w-full"
                type="submit"
                disabled={
                  createGameMutation.isPending ||
                  settingsDefaultsQuery.isLoading ||
                  movieGenresQuery.isLoading
                }>
                {createGameMutation.isPending
                  ? "Creating room..."
                  : "Create room"}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!gameCode.trim() || !displayName.trim()) {
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
                    setGameCode(event.target.value.toUpperCase())
                  }
                  placeholder="ABC123"
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
                disabled={joinGameMutation.isPending}>
                {joinGameMutation.isPending ? "Joining room..." : "Join room"}
              </Button>
            </form>
          )}

          {error ? (
            <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error instanceof Error ? error.message : "Unable to continue"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
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

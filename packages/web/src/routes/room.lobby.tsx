import {createFileRoute} from "@tanstack/react-router";
import {useEffect, useRef} from "react";
import {MOVIE_NIGHT_MODES} from "@deckflix/shared";
import QRCode from "qrcode";
import {Check, ChevronDown, Clock, Copy, Loader2, Play} from "lucide-react";
import {Eyebrow} from "../components/common";
import {Button, useToast} from "../components/ui";
import {GamePreferencesSection} from "../features/preferences/game-preferences-section";
import {useDisplayRoom} from "../features/display/DisplayRoomView";

export const Route = createFileRoute("/room/lobby")({
  component: DisplayRoomLobbyView,
});

function DisplayRoomLobbyView() {
  const {notify} = useToast();
  const {
    draftSettings,
    draftPreferences,
    meta,
    movieGenres,
    movieGenresError,
    movieGenresLoading,
    movieProvidersLoading,
    movieProviders,
    movieProvidersError,
    players,
    settingsSaveStatus,
    setDraftPreferences,
    setDraftSettings,
    startGame,
    startGamePending,
  } = useDisplayRoom();

  return (
    <section className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <Eyebrow className="text-white/45">Room code</Eyebrow>
          <div className="mt-2 font-mono text-3xl font-bold tracking-[0.24em] text-primary">
            {meta.summary.code}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(meta.summary.code);
              notify({
                type: "success",
                title: "Room code copied",
                description: meta.summary.code,
              });
            } catch {
              notify({
                type: "error",
                title: "Couldn’t copy room code",
              });
            }
          }}>
          <Copy />
          Copy
        </Button>
        <RoomQrCode gameCode={meta.summary.code} />
      </div>
      <div className="py-6">
        <div className="mb-6">
          <Eyebrow className="text-white/45">Choose a movie-night mode</Eyebrow>
          <h1 className="mt-2 text-2xl font-bold">What kind of night is this?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a starting point. Deckflix combines it with everyone&apos;s taste check.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MOVIE_NIGHT_MODES.map((mode) => {
              const selected =
                draftPreferences.popularityPreset ===
                  mode.preferences.popularityPreset &&
                draftPreferences.runtimeMinutesLte ===
                  mode.preferences.runtimeMinutesLte &&
                mode.preferences.includedGenreIds.every((genreId) =>
                  draftPreferences.includedGenreIds.includes(genreId),
                ) &&
                draftPreferences.includedGenreIds.length ===
                  mode.preferences.includedGenreIds.length;

              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={selected}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-primary/70 bg-primary/12 shadow-[0_0_24px_hsl(var(--primary)/0.1)]"
                      : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]"
                  }`}
                  onClick={() =>
                    setDraftPreferences({
                      ...draftPreferences,
                      ...mode.preferences,
                    })
                  }>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{mode.label}</span>
                    {selected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {mode.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        <details className="group rounded-2xl border border-white/10 bg-white/[0.025]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold">
            Fine-tune tonight&apos;s picks
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-white/10 p-4">
            <GamePreferencesSection
              settings={draftSettings}
              preferences={draftPreferences}
              onChange={setDraftSettings}
              onPreferencesChange={setDraftPreferences}
              movieGenres={movieGenres}
              movieGenresLoading={movieGenresLoading}
              movieGenresError={movieGenresError}
              movieProviders={movieProviders}
              movieProvidersLoading={movieProvidersLoading}
              movieProvidersError={movieProvidersError}
            />
          </div>
        </details>
      </div>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-white/10 bg-black/92 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-5">
        <AutosaveStatus status={settingsSaveStatus} />
        <Button
          effect="glow"
          onClick={startGame}
          disabled={startGamePending || players.length < 2}>
          {startGamePending ? (
            <>
              <Loader2 className="animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play />
              Start game
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

function RoomQrCode({gameCode}: {gameCode: string}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(
      canvasRef.current,
      `${window.location.origin}/join/${gameCode}`,
      {width: 132, margin: 1, color: {dark: "#000000", light: "#ffffff"}},
    );
  }, [gameCode]);

  return (
    <div className="ml-auto hidden items-center gap-3 sm:flex">
      <div className="text-right text-xs text-muted-foreground">
        Scan with a phone
        <div className="mt-1 text-white/70">No app or account needed</div>
      </div>
      <canvas ref={canvasRef} className="h-[108px] w-[108px] rounded-lg bg-white p-1" />
    </div>
  );
}

function AutosaveStatus({
  status,
}: {
  status: "idle" | "pending" | "saving" | "saved";
}) {
  if (status === "pending") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-4 w-4" />
        Autosave queued
      </div>
    );
  }

  if (status === "saving") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving...
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div className="flex items-center gap-2 text-xs text-swipe-like">
        <Check className="h-4 w-4" />
        Saved
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Check className="h-4 w-4" />
      Autosave on
    </div>
  );
}

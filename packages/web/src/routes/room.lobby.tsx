import {createFileRoute} from "@tanstack/react-router";
import {useEffect, useRef} from "react";
import QRCode from "qrcode";
import {Check, Clock, Copy, Loader2, Play} from "lucide-react";
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
          <Eyebrow className="text-white/45">Tonight&apos;s vibe</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              {label: "Crowd Pleaser", popularityPreset: "popular" as const, genres: [], runtime: 150},
              {label: "Cozy Night", popularityPreset: "balanced" as const, genres: [35, 10749], runtime: 120},
              {label: "Quick Laugh", popularityPreset: "popular" as const, genres: [35], runtime: 100},
              {label: "Hidden Gem", popularityPreset: "niche" as const, genres: [], runtime: 150},
              {label: "Family Night", popularityPreset: "balanced" as const, genres: [10751], runtime: 120},
              {label: "Surprise Us", popularityPreset: "any" as const, genres: [], runtime: null},
            ].map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDraftPreferences({
                    ...draftPreferences,
                    popularityPreset: preset.popularityPreset,
                    includedGenreIds: preset.genres,
                    runtimeMinutesLte: preset.runtime,
                  })
                }>
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
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

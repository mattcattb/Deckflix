import {createFileRoute} from "@tanstack/react-router";
import {Eyebrow} from "../components/common";
import {Button} from "../components/ui";
import {GamePreferencesSection} from "../features/preferences/game-preferences-section";
import {useDisplayRoom} from "../features/display/DisplayRoomView";

export const Route = createFileRoute("/room/lobby")({
  component: DisplayRoomLobbyView,
});

function DisplayRoomLobbyView() {
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
    saveSettings,
    saveSettingsPending,
    setDraftPreferences,
    setDraftSettings,
    startGame,
    startGamePending,
  } = useDisplayRoom();

  return (
    <section className="max-w-5xl">
      <div className="border-b border-white/10 pb-4">
        <Eyebrow className="text-white/45">Room code</Eyebrow>
        <button
          type="button"
          className="mt-2 font-mono text-3xl font-bold tracking-[0.24em] text-primary transition hover:text-[hsl(357_92%_55%)]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(meta.summary.code);
            } catch {
              // noop
            }
          }}>
          {meta.summary.code}
        </button>
      </div>
      <div className="py-6">
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
      <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
        <Button
          variant="secondary"
          size="sm"
          onClick={saveSettings}
          disabled={saveSettingsPending}>
          {saveSettingsPending ? "Saving..." : "Save"}
        </Button>
        <Button
          effect="glow"
          onClick={startGame}
          disabled={startGamePending || players.length < 2}>
          {startGamePending ? "Starting..." : "Start game"}
        </Button>
      </div>
    </section>
  );
}

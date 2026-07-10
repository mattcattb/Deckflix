import type {ReactNode} from "react";
import type {
  GamePreferences,
  GameSettings,
  MoviePopularityPreset,
  MovieWatchProvider,
} from "@deckflix/shared";
import {Eyebrow, StatusMessage} from "../../components/common";
import {
  Button,
  Input,
  Label,
  RangeSlider,
  Skeleton,
} from "../../components/ui";
import {GenrePicker, ProviderPicker} from "./GenrePicker";

type MovieGenre = {
  id: number;
  name: string;
};

type GenreListKey = "includedGenreIds" | "excludedGenreIds";

type GamePreferencesSectionProps = {
  settings: GameSettings;
  preferences: GamePreferences;
  onChange: (settings: GameSettings) => void;
  onPreferencesChange: (preferences: GamePreferences) => void;
  movieGenres: MovieGenre[];
  movieGenresLoading?: boolean;
  movieGenresError?: string | null;
  movieProviders: MovieWatchProvider[];
  movieProvidersLoading?: boolean;
  movieProvidersError?: string | null;
};

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1900;
const POPULARITY_PRESET_COPY: Record<MoviePopularityPreset, string> = {
  any: "Loosest mix. Minimal popularity bias in either direction.",
  balanced: "A healthy mix of hits, quality picks, and deeper cuts.",
  popular: "Leans toward mainstream, trending, and broadly-known movies.",
  niche: "Pushes deeper cuts and lowers the odds of obvious blockbusters.",
};

const extractYear = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function GamePreferencesSection({
  settings,
  preferences,
  onChange,
  onPreferencesChange,
  movieGenres,
  movieGenresLoading = false,
  movieGenresError,
  movieProviders,
  movieProvidersLoading = false,
  movieProvidersError,
}: GamePreferencesSectionProps) {
  const updateGameplaySetting = <Key extends keyof GameSettings["gameplay"]>(
    key: Key,
    value: GameSettings["gameplay"][Key],
  ) =>
    onChange({
      ...settings,
      gameplay: {...settings.gameplay, [key]: value},
    });

  const updateMoviePreference = <Key extends keyof GamePreferences>(
    key: Key,
    value: GamePreferences[Key],
  ) =>
    onPreferencesChange({
      ...preferences,
      [key]: value,
    });

  const toggleGenreId = (
    listKey: GenreListKey,
    otherListKey: GenreListKey,
    genreId: number,
    checked: boolean,
  ) => {
    const selectedGenreIds = preferences[listKey];
    const otherSelectedGenreIds = preferences[otherListKey];

    onPreferencesChange({
      ...preferences,
      [listKey]: checked
        ? [...new Set([...selectedGenreIds, genreId])]
        : selectedGenreIds.filter((id) => id !== genreId),
      [otherListKey]: otherSelectedGenreIds.filter((id) => id !== genreId),
    });
  };

  const toggleProviderId = (
    listKey: keyof Pick<GamePreferences, "preferredProviderIds">,
    providerId: number,
    checked: boolean,
  ) => {
    const selectedProviderIds = preferences[listKey];

    onPreferencesChange({
      ...preferences,
      [listKey]: checked
        ? [...new Set([...selectedProviderIds, providerId])]
        : selectedProviderIds.filter((id) => id !== providerId),
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1.15fr)]">
        <GameplaySettingsPanel
          settings={settings}
          popularityPreset={preferences.popularityPreset}
          onGameplayChange={updateGameplaySetting}
          onPopularityPresetChange={(popularityPreset) =>
            updateMoviePreference("popularityPreset", popularityPreset)
          }
        />

        <MovieRangeFiltersPanel
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          onMoviePreferenceChange={updateMoviePreference}
        />
      </div>

      <MovieCatalogFiltersPanel
        preferences={preferences}
        movieGenres={movieGenres}
        movieGenresLoading={movieGenresLoading}
        movieGenresError={movieGenresError}
        movieProviders={movieProviders}
        movieProvidersLoading={movieProvidersLoading}
        movieProvidersError={movieProvidersError}
        onMoviePreferenceChange={updateMoviePreference}
        onToggleGenreId={toggleGenreId}
        onToggleProviderId={toggleProviderId}
      />
    </div>
  );
}

function GameplaySettingsPanel({
  settings,
  popularityPreset,
  onGameplayChange,
  onPopularityPresetChange,
}: {
  settings: GameSettings;
  popularityPreset: MoviePopularityPreset;
  onGameplayChange: <Key extends keyof GameSettings["gameplay"]>(
    key: Key,
    value: GameSettings["gameplay"][Key],
  ) => void;
  onPopularityPresetChange: (preset: MoviePopularityPreset) => void;
}) {
  return (
    <SettingsSection
      title="Gameplay"
      description="Set the game size and the kind of movie mix the room should see.">
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
          <Label htmlFor="maxMovies" className="text-sm">
            Movies
          </Label>
          <Input
            id="maxMovies"
            type="number"
            min={1}
            max={500}
            className="w-20 text-center"
            value={settings.gameplay.maxMovies}
            onChange={(event) =>
              onGameplayChange(
                "maxMovies",
                Number.parseInt(event.target.value, 10) || 1,
              )
            }
          />
        </div>

        <div className="space-y-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
          <Label className="text-sm">Popularity</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {POPULARITY_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={popularityPreset === preset.value ? "primary" : "secondary"}
                size="sm"
                className="px-2"
                onClick={() => onPopularityPresetChange(preset.value)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {POPULARITY_PRESET_COPY[popularityPreset]}
          </p>
        </div>
      </div>

      <StatusMessage tone="success" className="mt-4 px-3 py-2">
        Strong group support creates finalists; nobody has to vote identically.
      </StatusMessage>
    </SettingsSection>
  );
}

const POPULARITY_PRESETS: Array<{
  value: MoviePopularityPreset;
  label: string;
}> = [
  {value: "any", label: "Any"},
  {value: "balanced", label: "Balanced"},
  {value: "popular", label: "Popular"},
  {value: "niche", label: "Niche"},
];

function MovieRangeFiltersPanel({
  preferences,
  onPreferencesChange,
  onMoviePreferenceChange,
}: {
  preferences: GamePreferences;
  onPreferencesChange: (preferences: GamePreferences) => void;
  onMoviePreferenceChange: <Key extends keyof GamePreferences>(
    key: Key,
    value: GamePreferences[Key],
  ) => void;
}) {
  const ratingEnabled =
    preferences.voteAverageGte != null ||
    preferences.voteAverageLte != null;
  const ratingValue: [number, number] | null = ratingEnabled
    ? [
        preferences.voteAverageGte ?? 0,
        preferences.voteAverageLte ?? 10,
      ]
    : null;

  const yearGteYear = preferences.primaryReleaseDateGte
    ? extractYear(preferences.primaryReleaseDateGte, MIN_YEAR)
    : null;
  const yearLteYear = preferences.primaryReleaseDateLte
    ? extractYear(preferences.primaryReleaseDateLte, CURRENT_YEAR)
    : null;
  const yearEnabled = yearGteYear != null || yearLteYear != null;
  const yearValue: [number, number] | null = yearEnabled
    ? [yearGteYear ?? MIN_YEAR, yearLteYear ?? CURRENT_YEAR]
    : null;

  const updateWatchRegion = (nextRaw: string) => {
    const next = nextRaw.trim().toUpperCase().slice(0, 2);
    onMoviePreferenceChange(
      "watchRegion",
      (next.length === 2 ? next : preferences.watchRegion),
    );
  };

  return (
    <SettingsSection
      title="Movie filters"
      description="Constrain the deck by rating, release window, and availability region.">
      <div className="grid gap-3">
        <RangeSlider
          label="TMDB rating"
          min={0}
          max={10}
          step={0.1}
          value={ratingValue}
          defaultRange={[6, 10]}
          formatValue={(v) => v.toFixed(1)}
          onChange={(next) => {
            if (next === null) {
              onPreferencesChange({
                ...preferences,
                voteAverageGte: null,
                voteAverageLte: null,
              });
            } else {
              onPreferencesChange({
                ...preferences,
                voteAverageGte: Number(next[0].toFixed(1)),
                voteAverageLte: Number(next[1].toFixed(1)),
              });
            }
          }}
        />

        <RangeSlider
          label="Release year"
          min={MIN_YEAR}
          max={CURRENT_YEAR}
          step={1}
          value={yearValue}
          defaultRange={[2000, CURRENT_YEAR]}
          onChange={(next) => {
            if (next === null) {
              onPreferencesChange({
                ...preferences,
                primaryReleaseDateGte: null,
                primaryReleaseDateLte: null,
              });
            } else {
              onPreferencesChange({
                ...preferences,
                primaryReleaseDateGte: `${next[0]}-01-01`,
                primaryReleaseDateLte: `${next[1]}-12-31`,
              });
            }
          }}
        />
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
        <Label htmlFor="watchRegion" className="text-xs">
          Watch region
        </Label>
        <Input
          id="watchRegion"
          className="w-20 text-center"
          maxLength={2}
          value={preferences.watchRegion}
          onChange={(event) =>
            updateWatchRegion(event.currentTarget.value.toUpperCase())
          }
          onBlur={(event) => updateWatchRegion(event.currentTarget.value)}
        />
      </div>
      <div className="mt-3 space-y-2 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
        <Label className="text-xs">Maximum runtime</Label>
        <div className="grid grid-cols-4 gap-2">
          {[90, 120, 150, null].map((minutes) => (
            <Button
              key={minutes ?? "any"}
              type="button"
              size="sm"
              variant={preferences.runtimeMinutesLte === minutes ? "primary" : "secondary"}
              onClick={() => onMoviePreferenceChange("runtimeMinutesLte", minutes)}>
              {minutes ? `${minutes}m` : "Any"}
            </Button>
          ))}
        </div>
      </div>
    </SettingsSection>
  );
}

function MovieCatalogFiltersPanel({
  preferences,
  movieGenres,
  movieGenresLoading,
  movieGenresError,
  movieProviders,
  movieProvidersLoading,
  movieProvidersError,
  onMoviePreferenceChange,
  onToggleGenreId,
  onToggleProviderId,
}: {
  preferences: GamePreferences;
  movieGenres: MovieGenre[];
  movieGenresLoading: boolean;
  movieGenresError?: string | null;
  movieProviders: MovieWatchProvider[];
  movieProvidersLoading: boolean;
  movieProvidersError?: string | null;
  onMoviePreferenceChange: <Key extends keyof GamePreferences>(
    key: Key,
    value: GamePreferences[Key],
  ) => void;
  onToggleGenreId: (
    listKey: GenreListKey,
    otherListKey: GenreListKey,
    genreId: number,
    checked: boolean,
  ) => void;
  onToggleProviderId: (
    listKey: keyof Pick<GamePreferences, "preferredProviderIds">,
    providerId: number,
    checked: boolean,
  ) => void;
}) {
  return (
    <SettingsSection
      title="Catalog"
      description="Choose genres and streaming providers from TMDB-backed lists.">
      {movieGenresLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : movieGenresError ? (
        <StatusMessage tone="danger" className="rounded-lg px-3 py-2 text-xs">
          {movieGenresError}
        </StatusMessage>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <GenrePicker
            label="Include"
            tone="include"
            genres={movieGenres.filter(
              (genre) =>
                !preferences.excludedGenreIds.includes(genre.id) ||
                preferences.includedGenreIds.includes(genre.id),
            )}
            selectedGenreIds={preferences.includedGenreIds}
            emptyLabel="All genres"
            onToggle={(genreId, checked) =>
              onToggleGenreId(
                "includedGenreIds",
                "excludedGenreIds",
                genreId,
                checked,
              )
            }
            onClear={() => onMoviePreferenceChange("includedGenreIds", [])}
          />
          <GenrePicker
            label="Exclude"
            tone="exclude"
            genres={movieGenres.filter(
              (genre) =>
                !preferences.includedGenreIds.includes(genre.id) ||
                preferences.excludedGenreIds.includes(genre.id),
            )}
            selectedGenreIds={preferences.excludedGenreIds}
            emptyLabel="None"
            onToggle={(genreId, checked) =>
              onToggleGenreId(
                "excludedGenreIds",
                "includedGenreIds",
                genreId,
                checked,
              )
            }
            onClear={() => onMoviePreferenceChange("excludedGenreIds", [])}
          />
        </div>
      )}

      {movieProvidersLoading ? (
        <Skeleton className="h-20" />
      ) : movieProvidersError ? (
        <StatusMessage tone="danger" className="rounded-lg px-3 py-2 text-xs">
          {movieProvidersError}
        </StatusMessage>
      ) : movieProviders.length === 0 ? (
        <StatusMessage tone="info" className="rounded-lg px-3 py-2 text-xs">
          No providers are available for this region.
        </StatusMessage>
      ) : (
        <ProviderPicker
          label="Preferred providers"
          tone="include"
          providers={movieProviders}
          selectedProviderIds={preferences.preferredProviderIds}
          emptyLabel="Any provider"
          onToggle={(providerId, checked) =>
            onToggleProviderId("preferredProviderIds", providerId, checked)
          }
          onClear={() => onMoviePreferenceChange("preferredProviderIds", [])}
        />
      )}
    </SettingsSection>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="mb-4 space-y-1">
        <Eyebrow as="h3" className="text-xs tracking-[0.18em]">
          {title}
        </Eyebrow>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

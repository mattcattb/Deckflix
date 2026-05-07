import type {
  GamePreferences,
  GameSettings,
  MoviePopularityPreset,
} from "@deckflix/shared";
import {Eyebrow, StatusMessage} from "../../components/common";
import {Input, Label, RangeSlider, Select} from "../../components/ui";
import {GenrePicker} from "./GenrePicker";

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

  return (
    <div className="space-y-5">
      <GameplaySettingsPanel
        settings={settings}
        popularityPreset={preferences.popularityPreset}
        onGameplayChange={updateGameplaySetting}
        onPopularityPresetChange={(popularityPreset) =>
          updateMoviePreference("popularityPreset", popularityPreset)
        }
      />

      <MovieFiltersPanel
        preferences={preferences}
        movieGenres={movieGenres}
        movieGenresLoading={movieGenresLoading}
        movieGenresError={movieGenresError}
        onPreferencesChange={onPreferencesChange}
        onMoviePreferenceChange={updateMoviePreference}
        onToggleGenreId={toggleGenreId}
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
    <section className="space-y-3">
      <Eyebrow as="h3" className="text-xs tracking-[0.18em]">
        Gameplay
      </Eyebrow>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
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

          <div className="ml-auto flex min-w-[12rem] items-center gap-2">
            <Label htmlFor="popularityPreset" className="text-sm">
              Popularity
            </Label>
            <Select
              id="popularityPreset"
              className="h-9 min-w-0 flex-1 px-2"
              value={popularityPreset}
              onChange={(event) =>
                onPopularityPresetChange(event.target.value as MoviePopularityPreset)
              }>
              <option value="any">Any</option>
              <option value="balanced">Balanced</option>
              <option value="popular">Popular</option>
              <option value="niche">Allison (Niche)</option>
            </Select>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {POPULARITY_PRESET_COPY[popularityPreset]}
        </p>
      </div>

      <StatusMessage tone="success" className="px-3 py-2">
        A match happens only when every player likes the same movie.
      </StatusMessage>
    </section>
  );
}

function MovieFiltersPanel({
  preferences,
  movieGenres,
  movieGenresLoading,
  movieGenresError,
  onPreferencesChange,
  onMoviePreferenceChange,
  onToggleGenreId,
}: {
  preferences: GamePreferences;
  movieGenres: MovieGenre[];
  movieGenresLoading: boolean;
  movieGenresError?: string | null;
  onPreferencesChange: (preferences: GamePreferences) => void;
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

  return (
    <section className="space-y-3">
        <Eyebrow as="h3" className="text-xs tracking-[0.18em]">
          Movie filters
        </Eyebrow>

        <div className="grid gap-2">
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

        {movieGenresLoading ? (
          <p className="text-xs text-muted-foreground">Loading genres...</p>
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
      </section>
  );
}

import type {GameSettings} from "@deckflix/shared";
import {Input, Label, RangeSlider, Select} from "../ui";
import {GenrePicker} from "./genre-picker";

type MovieGenre = {
  id: number;
  name: string;
};

type GenreListKey = "includedGenreIds" | "excludedGenreIds";

type GameSettingsSectionProps = {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  movieGenres: MovieGenre[];
  movieGenresLoading?: boolean;
  movieGenresError?: string | null;
};

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1900;
const POPULARITY_PRESET_COPY: Record<
  GameSettings["movieFilters"]["popularityPreset"],
  string
> = {
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

export function GameSettingsSection({
  settings,
  onChange,
  movieGenres,
  movieGenresLoading = false,
  movieGenresError,
}: GameSettingsSectionProps) {
  const updateGameplaySetting = <Key extends keyof GameSettings["gameplay"]>(
    key: Key,
    value: GameSettings["gameplay"][Key],
  ) =>
    onChange({
      ...settings,
      gameplay: {...settings.gameplay, [key]: value},
    });

  const updateMovieFilterSetting = <
    Key extends keyof GameSettings["movieFilters"],
  >(
    key: Key,
    value: GameSettings["movieFilters"][Key],
  ) =>
    onChange({
      ...settings,
      movieFilters: {...settings.movieFilters, [key]: value},
    });

  const toggleGenreId = (
    listKey: GenreListKey,
    otherListKey: GenreListKey,
    genreId: number,
    checked: boolean,
  ) => {
    const selectedGenreIds = settings.movieFilters[listKey];
    const otherSelectedGenreIds = settings.movieFilters[otherListKey];

    onChange({
      ...settings,
      movieFilters: {
        ...settings.movieFilters,
        [listKey]: checked
          ? [...new Set([...selectedGenreIds, genreId])]
          : selectedGenreIds.filter((id) => id !== genreId),
        [otherListKey]: otherSelectedGenreIds.filter((id) => id !== genreId),
      },
    });
  };

  const ratingEnabled =
    settings.movieFilters.voteAverageGte != null ||
    settings.movieFilters.voteAverageLte != null;
  const ratingValue: [number, number] | null = ratingEnabled
    ? [
        settings.movieFilters.voteAverageGte ?? 0,
        settings.movieFilters.voteAverageLte ?? 10,
      ]
    : null;

  const yearGteYear = settings.movieFilters.primaryReleaseDateGte
    ? extractYear(settings.movieFilters.primaryReleaseDateGte, MIN_YEAR)
    : null;
  const yearLteYear = settings.movieFilters.primaryReleaseDateLte
    ? extractYear(settings.movieFilters.primaryReleaseDateLte, CURRENT_YEAR)
    : null;
  const yearEnabled = yearGteYear != null || yearLteYear != null;
  const yearValue: [number, number] | null = yearEnabled
    ? [yearGteYear ?? MIN_YEAR, yearLteYear ?? CURRENT_YEAR]
    : null;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Gameplay
        </h3>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
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
                updateGameplaySetting(
                  "maxMovies",
                  Number.parseInt(event.target.value, 10) || 1,
                )
              }
            />
          </div>
        </div>

        <p className="rounded-xl border border-swipe-like/20 bg-swipe-like/10 px-3 py-2 text-sm text-swipe-like">
          A match happens only when every player likes the same movie.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Movie filters
        </h3>

        <div className="grid gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
            <Label htmlFor="popularityPreset" className="text-sm">
              Popularity
            </Label>
            <Select
              id="popularityPreset"
              className="mt-2"
              value={settings.movieFilters.popularityPreset}
              onChange={(event) =>
                updateMovieFilterSetting(
                  "popularityPreset",
                  event.target.value as GameSettings["movieFilters"]["popularityPreset"],
                )
              }>
              <option value="any">Any</option>
              <option value="balanced">Balanced</option>
              <option value="popular">Popular</option>
              <option value="niche">Niche</option>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              {POPULARITY_PRESET_COPY[settings.movieFilters.popularityPreset]}
            </p>
          </div>

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
                onChange({
                  ...settings,
                  movieFilters: {
                    ...settings.movieFilters,
                    voteAverageGte: null,
                    voteAverageLte: null,
                  },
                });
              } else {
                onChange({
                  ...settings,
                  movieFilters: {
                    ...settings.movieFilters,
                    voteAverageGte: Number(next[0].toFixed(1)),
                    voteAverageLte: Number(next[1].toFixed(1)),
                  },
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
                onChange({
                  ...settings,
                  movieFilters: {
                    ...settings.movieFilters,
                    primaryReleaseDateGte: null,
                    primaryReleaseDateLte: null,
                  },
                });
              } else {
                onChange({
                  ...settings,
                  movieFilters: {
                    ...settings.movieFilters,
                    primaryReleaseDateGte: `${next[0]}-01-01`,
                    primaryReleaseDateLte: `${next[1]}-12-31`,
                  },
                });
              }
            }}
          />
        </div>

        {movieGenresLoading ? (
          <p className="text-xs text-muted-foreground">Loading genres...</p>
        ) : movieGenresError ? (
          <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
            {movieGenresError}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <GenrePicker
              label="Include"
              tone="include"
              genres={movieGenres.filter(
                (genre) =>
                  !settings.movieFilters.excludedGenreIds.includes(genre.id) ||
                  settings.movieFilters.includedGenreIds.includes(genre.id),
              )}
              selectedGenreIds={settings.movieFilters.includedGenreIds}
              emptyLabel="All genres"
              onToggle={(genreId, checked) =>
                toggleGenreId(
                  "includedGenreIds",
                  "excludedGenreIds",
                  genreId,
                  checked,
                )
              }
              onClear={() => updateMovieFilterSetting("includedGenreIds", [])}
            />
            <GenrePicker
              label="Exclude"
              tone="exclude"
              genres={movieGenres.filter(
                (genre) =>
                  !settings.movieFilters.includedGenreIds.includes(genre.id) ||
                  settings.movieFilters.excludedGenreIds.includes(genre.id),
              )}
              selectedGenreIds={settings.movieFilters.excludedGenreIds}
              emptyLabel="None"
              onToggle={(genreId, checked) =>
                toggleGenreId(
                  "excludedGenreIds",
                  "includedGenreIds",
                  genreId,
                  checked,
                )
              }
              onClear={() => updateMovieFilterSetting("excludedGenreIds", [])}
            />
          </div>
        )}
      </section>
    </div>
  );
}

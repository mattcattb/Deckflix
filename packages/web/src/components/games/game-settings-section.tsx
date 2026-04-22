import type {GameSettings} from "@deckflix/shared";
import {Checkbox, Input, Label, Switch} from "../ui";

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

type GenreSelectionGroupProps = {
  title: string;
  description: string;
  genres: MovieGenre[];
  selectedGenreIds: number[];
  onToggle: (genreId: number, checked: boolean) => void;
  onClear: () => void;
};

const parseNullableNumber = (value: string) =>
  value.trim() === "" ? null : Number.parseFloat(value);

const parseNullableDate = (value: string) => value || null;

function GenreSelectionGroup({
  title,
  description,
  genres,
  selectedGenreIds,
  onToggle,
  onClear,
}: GenreSelectionGroupProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>{title}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {selectedGenreIds.length > 0 ? (
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        {genres.map((genre) => (
          <Checkbox
            key={genre.id}
            checked={selectedGenreIds.includes(genre.id)}
            onCheckedChange={(checked) => onToggle(genre.id, checked === true)}
            label={genre.name}
          />
        ))}
      </div>
    </div>
  );
}

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
      gameplay: {
        ...settings.gameplay,
        [key]: value,
      },
    });

  const updateMovieFilterSetting = <
    Key extends keyof GameSettings["movieFilters"],
  >(
    key: Key,
    value: GameSettings["movieFilters"][Key],
  ) =>
    onChange({
      ...settings,
      movieFilters: {
        ...settings.movieFilters,
        [key]: value,
      },
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

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Gameplay
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tune how the room votes and when titles become matches.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="minLikesToMatch">Likes needed to match</Label>
            <Input
              id="minLikesToMatch"
              type="number"
              min={1}
              max={50}
              value={settings.gameplay.minLikesToMatch}
              onChange={(event) =>
                updateGameplaySetting(
                  "minLikesToMatch",
                  Number.parseInt(event.target.value, 10) || 1,
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxMovies">Movies per round</Label>
            <Input
              id="maxMovies"
              type="number"
              min={1}
              max={500}
              value={settings.gameplay.maxMovies}
              onChange={(event) =>
                updateGameplaySetting(
                  "maxMovies",
                  Number.parseInt(event.target.value, 10) || 1,
                )
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-sm font-medium">Maybe votes</div>
              <div className="text-xs text-muted-foreground">
                Let players keep titles in a soft shortlist.
              </div>
            </div>
            <Switch
              checked={settings.gameplay.allowMaybe}
              onCheckedChange={(checked) =>
                updateGameplaySetting("allowMaybe", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-sm font-medium">Super likes</div>
              <div className="text-xs text-muted-foreground">
                Enable stronger positive votes for must-watch picks.
              </div>
            </div>
            <Switch
              checked={settings.gameplay.allowSuperLike}
              onCheckedChange={(checked) =>
                updateGameplaySetting("allowSuperLike", checked)
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Movie filters
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Narrow the TMDB pool before the round starts.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="primaryReleaseDateGte">Released after</Label>
            <Input
              id="primaryReleaseDateGte"
              type="date"
              value={settings.movieFilters.primaryReleaseDateGte ?? ""}
              max={settings.movieFilters.primaryReleaseDateLte ?? undefined}
              onChange={(event) =>
                updateMovieFilterSetting(
                  "primaryReleaseDateGte",
                  parseNullableDate(event.target.value),
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="primaryReleaseDateLte">Released before</Label>
            <Input
              id="primaryReleaseDateLte"
              type="date"
              value={settings.movieFilters.primaryReleaseDateLte ?? ""}
              min={settings.movieFilters.primaryReleaseDateGte ?? undefined}
              onChange={(event) =>
                updateMovieFilterSetting(
                  "primaryReleaseDateLte",
                  parseNullableDate(event.target.value),
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voteAverageGte">Minimum TMDB rating</Label>
            <Input
              id="voteAverageGte"
              type="number"
              min={0}
              max={10}
              step="0.1"
              value={settings.movieFilters.voteAverageGte ?? ""}
              onChange={(event) =>
                updateMovieFilterSetting(
                  "voteAverageGte",
                  parseNullableNumber(event.target.value),
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voteAverageLte">Maximum TMDB rating</Label>
            <Input
              id="voteAverageLte"
              type="number"
              min={0}
              max={10}
              step="0.1"
              value={settings.movieFilters.voteAverageLte ?? ""}
              onChange={(event) =>
                updateMovieFilterSetting(
                  "voteAverageLte",
                  parseNullableNumber(event.target.value),
                )
              }
            />
          </div>
        </div>

        {movieGenresLoading ? (
          <p className="text-sm text-muted-foreground">Loading genres...</p>
        ) : movieGenresError ? (
          <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {movieGenresError}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <GenreSelectionGroup
              title="Include genres"
              description="Movies can match any selected genre."
              genres={movieGenres.filter(
                (genre) =>
                  !settings.movieFilters.excludedGenreIds.includes(genre.id) ||
                  settings.movieFilters.includedGenreIds.includes(genre.id),
              )}
              selectedGenreIds={settings.movieFilters.includedGenreIds}
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
            <GenreSelectionGroup
              title="Avoid genres"
              description="Exclude movies that contain any selected genre."
              genres={movieGenres.filter(
                (genre) =>
                  !settings.movieFilters.includedGenreIds.includes(genre.id) ||
                  settings.movieFilters.excludedGenreIds.includes(genre.id),
              )}
              selectedGenreIds={settings.movieFilters.excludedGenreIds}
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

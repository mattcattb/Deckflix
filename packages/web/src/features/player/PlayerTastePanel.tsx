import {useDeferredValue, useState} from "react";
import {useMutation, useQuery} from "@tanstack/react-query";
import {
  PLAYER_TASTE_MOODS,
  type PlayerTaste,
} from "@deckflix/shared";
import {Button, Input} from "../../components/ui";
import {api, parseRpc} from "../../lib/api";
import {movieGenresQueryOptions} from "../movie-catalog/movie-catalog.queries";

export function PlayerTastePanel({
  taste,
  onSaved,
}: {
  taste: PlayerTaste;
  onSaved: (taste: PlayerTaste) => void;
}) {
  const [open, setOpen] = useState(false);
  const genres = useQuery({
    ...movieGenresQueryOptions(),
    enabled: open,
  });
  const [draft, setDraft] = useState(taste);
  const [movieSearch, setMovieSearch] = useState("");
  const deferredMovieSearch = useDeferredValue(movieSearch.trim());
  const movieResults = useQuery({
    queryKey: ["taste-movie-search", deferredMovieSearch],
    queryFn: () =>
      parseRpc(
        api.api.movies.search.$get({
          query: {q: deferredMovieSearch, page: 1},
        }),
      ),
    enabled: open && deferredMovieSearch.length >= 2,
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      parseRpc(api.api.player.me.taste.$patch({json: draft})),
    onSuccess: onSaved,
  });

  const toggle = <Value,>(values: Value[], value: Value, limit: number) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : values.length < limit
        ? [...values, value]
        : values;

  if (!open) {
    return (
      <Button
        className="w-full"
        variant="secondary"
        onClick={() => setOpen(true)}>
        Tune my picks <span className="text-white/45">Optional</span>
      </Button>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tune my picks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up to three of each.
          </p>
        </div>
        <Button
          aria-label="Close taste settings"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {PLAYER_TASTE_MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            className={draft.moods.includes(mood)
              ? "rounded-full bg-primary px-3 py-2 text-sm text-white"
              : "rounded-full border border-white/12 px-3 py-2 text-sm text-white/65"}
            onClick={() => setDraft({...draft, moods: toggle(draft.moods, mood, 3)})}>
            {mood[0].toUpperCase() + mood.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
        {(genres.data?.items ?? []).map((genre) => (
          <button
            key={genre.id}
            type="button"
            className={draft.genreIds.includes(genre.id)
              ? "rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black"
              : "rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/60"}
            onClick={() => setDraft({...draft, genreIds: toggle(draft.genreIds, genre.id, 3)})}>
            {genre.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["familiar", "balanced", "adventurous"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={draft.discovery === value
              ? "rounded-lg border border-primary bg-primary/15 px-2 py-2 text-xs text-white"
              : "rounded-lg border border-white/10 px-2 py-2 text-xs text-white/55"}
            onClick={() => setDraft({...draft, discovery: value})}>
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Input
          value={movieSearch}
          placeholder="A movie you already love…"
          onChange={(event) => setMovieSearch(event.target.value)}
        />
        {movieResults.data?.items.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {movieResults.data.items.slice(0, 6).map((movie) => {
              const selected = draft.anchorMovieIds.includes(movie.id);
              return (
                <button
                  key={movie.id}
                  type="button"
                  className={selected
                    ? "w-24 shrink-0 overflow-hidden rounded-lg border border-primary bg-primary/15"
                    : "w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30"}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      anchorMovieIds: toggle(draft.anchorMovieIds, movie.id, 3),
                    })
                  }>
                  <img src={movie.posterUrl} alt="" className="aspect-[2/3] w-full object-cover" />
                  <span className="block truncate p-1.5 text-xs">{movie.title}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <Button
        className="w-full"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Saving taste…" : "Save my taste"}
      </Button>
      {mutation.error ? (
        <p className="text-sm text-danger">Unable to save your taste.</p>
      ) : null}
    </section>
  );
}

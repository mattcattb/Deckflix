import {useDeferredValue, useState} from "react";
import {useMutation, useQuery} from "@tanstack/react-query";
import {Button, Input} from "../../components/ui";
import {api, parseRpc} from "../../lib/api";

export function MovieSuggestionPanel({
  remaining,
  onSuggested,
}: {
  remaining: number;
  onSuggested: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const results = useQuery({
    queryKey: ["movie-search", deferredSearch],
    queryFn: () =>
      parseRpc(api.api.movies.search.$get({query: {q: deferredSearch, page: 1}})),
    enabled: deferredSearch.length >= 2 && remaining > 0,
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (movieId: string) =>
      parseRpc(api.api.game.suggestions.$post({json: {movieId}})),
    onSuccess: () => {
      setOpen(false);
      setSearch("");
      onSuggested();
    },
  });

  if (remaining === 0) {
    return (
      <div className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/55">
        Your movie suggestion is in the room.
      </div>
    );
  }

  if (!open) {
    return (
      <Button className="w-full" variant="secondary" onClick={() => setOpen(true)}>
        Suggest a movie · {remaining} slot
      </Button>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-primary/30 bg-[#101010] p-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bring one movie</h2>
          <p className="text-xs text-muted-foreground">Everyone else will get a chance to vote.</p>
        </div>
        <button className="text-sm text-white/55" onClick={() => setOpen(false)}>Close</button>
      </div>
      <Input
        autoFocus
        value={search}
        placeholder="Search movies…"
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {(results.data?.items ?? []).slice(0, 8).map((movie) => (
          <button
            key={movie.id}
            type="button"
            disabled={mutation.isPending}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 p-2 text-left hover:bg-white/[0.06]"
            onClick={() => mutation.mutate(movie.id)}>
            <img src={movie.posterUrl} alt="" className="h-16 w-11 rounded object-cover" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{movie.title}</span>
              <span className="text-xs text-muted-foreground">{movie.year} · ★ {movie.rating.toFixed(1)}</span>
            </span>
          </button>
        ))}
      </div>
      {mutation.error ? <p className="text-sm text-danger">{mutation.error instanceof Error ? mutation.error.message : "Unable to suggest that movie"}</p> : null}
    </section>
  );
}

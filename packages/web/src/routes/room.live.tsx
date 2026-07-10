import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import type {MovieCandidate} from "@deckflix/shared";
import {DisplayRail, MatchFoundOverlay} from "../features/display/DisplayRails";
import {useDisplayRoom} from "../features/display/DisplayRoomView";
import {
  activeGameMatchesQueryOptions,
  activeGameRecentQueryOptions,
  activeGameStinkersQueryOptions,
  activeFinaleQueryOptions,
} from "../features/room/room.queries";
import {Button} from "../components/ui";
import {api, parseRpc} from "../lib/api";

export const Route = createFileRoute("/room/live")({
  component: DisplayRoomLiveView,
});

function DisplayRoomLiveView() {
  const {gameCode, lastDisplayMessage, draftPreferences, meta} = useDisplayRoom();
  const queryClient = useQueryClient();
  const matchesQuery = useQuery(activeGameMatchesQueryOptions(gameCode));
  const recentQuery = useQuery(activeGameRecentQueryOptions(gameCode));
  const stinkersQuery = useQuery(activeGameStinkersQueryOptions(gameCode));
  const [activeMatch, setActiveMatch] = useState<MovieCandidate | null>(null);
  const finaleQuery = useQuery({
    ...activeFinaleQueryOptions(gameCode),
    refetchInterval: meta.summary.status === "finale" ? 1_000 : false,
  });
  const startFinale = useMutation({
    mutationFn: () => parseRpc(api.api.game.finale.start.$post()),
    onSuccess: (state) => {
      queryClient.setQueryData(activeFinaleQueryOptions(gameCode).queryKey, state);
      void queryClient.invalidateQueries({queryKey: ["room", gameCode]});
    },
  });

  useEffect(() => {
    if (!lastDisplayMessage) {
      return;
    }

    if (
      lastDisplayMessage.type !== "game.vote_recorded" &&
      lastDisplayMessage.type !== "game.match_found"
    ) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: activeGameRecentQueryOptions(gameCode).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: activeGameStinkersQueryOptions(gameCode).queryKey,
    });

    if (lastDisplayMessage.type === "game.vote_recorded") {
      void queryClient.invalidateQueries({
        queryKey: activeGameMatchesQueryOptions(gameCode).queryKey,
      });
      return;
    }

    void (async () => {
      const matches = await queryClient.fetchQuery(
        activeGameMatchesQueryOptions(gameCode),
      );
      const match = matches.items.find(
        (item) => item.movie.id === lastDisplayMessage.movieId,
      );
      if (match) {
        setActiveMatch(match.movie);
      }
    })();
  }, [gameCode, lastDisplayMessage, queryClient]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }

    const timeout = window.setTimeout(() => setActiveMatch(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [activeMatch]);

  return (
    <div className="space-y-6">
      {activeMatch ? <MatchFoundOverlay movie={activeMatch} /> : null}
      {meta.summary.status === "finale" ? (
        <FinaleBoard
          finalists={finaleQuery.data?.finalists ?? []}
          totalPlayers={finaleQuery.data?.totalPlayers ?? meta.summary.playerCount}
          totalVotes={finaleQuery.data?.totalVotes ?? 0}
        />
      ) : null}
      {meta.summary.status === "swiping" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] p-4">
          <div>
            <div className="font-semibold">Ready to make the final call?</div>
            <div className="text-sm text-muted-foreground">
              We’ll choose up to three well-tested favorites.
            </div>
          </div>
          <Button
            disabled={startFinale.isPending}
            onClick={() => startFinale.mutate()}>
            {startFinale.isPending ? "Building shortlist…" : "Start final round"}
          </Button>
          {startFinale.error ? (
            <p className="w-full text-sm text-warning">
              {startFinale.error instanceof Error ? startFinale.error.message : "Keep swiping a little longer."}
            </p>
          ) : null}
        </div>
      ) : null}
      <DisplayRail
        title="Matches"
        items={matchesQuery.data?.items ?? []}
        tone="match"
        watchRegion={draftPreferences.watchRegion}
      />
      <DisplayRail
        title="Recent History"
        items={recentQuery.data?.items ?? []}
        tone="mixed"
        watchRegion={draftPreferences.watchRegion}
        interactive={false}
      />
      <DisplayRail
        title="Stinkers"
        items={stinkersQuery.data?.items ?? []}
        tone="stinker"
        watchRegion={draftPreferences.watchRegion}
      />
    </div>
  );
}

function FinaleBoard({
  finalists,
  totalPlayers,
  totalVotes,
}: {
  finalists: MovieCandidate[];
  totalPlayers: number;
  totalVotes: number;
}) {
  return (
    <section className="rounded-3xl border border-primary/30 bg-gradient-to-b from-primary/15 to-black p-6 text-center">
      <div className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
        Final round
      </div>
      <h1 className="mt-2 text-3xl font-bold">Choose tonight&apos;s movie</h1>
      <div className="mx-auto mt-6 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
        {finalists.map((movie) => (
          <article key={movie.id} className="overflow-hidden rounded-2xl border border-white/12 bg-black/55 text-left">
            <img src={movie.posterUrl} alt="" className="aspect-[2/3] w-full object-cover" />
            <div className="p-3 font-semibold">{movie.title}</div>
          </article>
        ))}
      </div>
      <div className="mt-5 text-sm text-white/60">
        {totalVotes} of {totalPlayers} final votes
      </div>
    </section>
  );
}

import {useEffect} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import {DisplayRail} from "../features/display/DisplayRails";
import {useDisplayRoom} from "../features/display/DisplayRoomView";
import {
  activeGameMatchesQueryOptions,
  activeGameStinkersQueryOptions,
  activeFinaleQueryOptions,
} from "../features/room/room.queries";
import {movieDetailsQueryOptions} from "../features/movie-catalog/movie-catalog.queries";

export const Route = createFileRoute("/room/results")({
  component: DisplayRoomResultsView,
});

function DisplayRoomResultsView() {
  const {gameCode, lastDisplayMessage, draftPreferences} = useDisplayRoom();
  const queryClient = useQueryClient();
  const matchesQuery = useQuery(activeGameMatchesQueryOptions(gameCode));
  const stinkersQuery = useQuery(activeGameStinkersQueryOptions(gameCode));
  const finaleQuery = useQuery(activeFinaleQueryOptions(gameCode));
  const winnerDetailsQuery = useQuery(
    movieDetailsQueryOptions(
      finaleQuery.data?.winner?.id ?? "",
      "en-US",
      draftPreferences.watchRegion,
    ),
  );

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
      queryKey: activeGameMatchesQueryOptions(gameCode).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: activeGameStinkersQueryOptions(gameCode).queryKey,
    });
  }, [gameCode, lastDisplayMessage, queryClient]);

  return (
    <div className="space-y-6">
      {finaleQuery.data?.winner ? (
        <section className="grid overflow-hidden rounded-3xl border border-primary/30 bg-primary/10 sm:grid-cols-[14rem_1fr]">
          <img
            src={finaleQuery.data.winner.posterUrl}
            alt=""
            className="h-72 w-full object-cover sm:h-full"
          />
          <div className="flex flex-col justify-center p-7">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Tonight&apos;s pick</div>
            <h1 className="mt-3 text-4xl font-bold">{finaleQuery.data.winner.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/65">
              <span>{finaleQuery.data.winner.year}</span>
              {winnerDetailsQuery.data?.runtimeMinutes ? (
                <span>· {winnerDetailsQuery.data.runtimeMinutes} min</span>
              ) : null}
              {winnerDetailsQuery.data?.watchProviders.stream.length ? (
                <span>
                  · Streaming on {winnerDetailsQuery.data.watchProviders.stream
                    .slice(0, 3)
                    .map((provider) => provider.name)
                    .join(", ")}
                </span>
              ) : null}
            </div>
            <p className="mt-3 max-w-xl text-white/65">{finaleQuery.data.winner.overview}</p>
          </div>
        </section>
      ) : null}
      <DisplayRail
        title="Final Matches"
        items={matchesQuery.data?.items ?? []}
        tone="match"
        watchRegion={draftPreferences.watchRegion}
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

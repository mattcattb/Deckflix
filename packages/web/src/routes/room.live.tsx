import {useEffect, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import type {MovieCandidate} from "@deckflix/shared";
import {DisplayRail, MatchFoundOverlay} from "../features/display/DisplayRails";
import {useDisplayRoom} from "../features/display/DisplayRoomView";
import {
  activeGameMatchesQueryOptions,
  activeGameRecentQueryOptions,
  activeGameStinkersQueryOptions,
} from "../features/room/room.queries";

export const Route = createFileRoute("/room/live")({
  component: DisplayRoomLiveView,
});

function DisplayRoomLiveView() {
  const {gameCode, lastDisplayMessage} = useDisplayRoom();
  const queryClient = useQueryClient();
  const matchesQuery = useQuery(activeGameMatchesQueryOptions(gameCode));
  const recentQuery = useQuery(activeGameRecentQueryOptions(gameCode));
  const stinkersQuery = useQuery(activeGameStinkersQueryOptions(gameCode));
  const [activeMatch, setActiveMatch] = useState<MovieCandidate | null>(null);

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
      <DisplayRail
        title="Matches"
        items={matchesQuery.data?.items ?? []}
        tone="match"
      />
      <DisplayRail
        title="Recent History"
        items={recentQuery.data?.items ?? []}
        tone="mixed"
        interactive={false}
      />
      <DisplayRail
        title="Stinkers"
        items={stinkersQuery.data?.items ?? []}
        tone="stinker"
      />
    </div>
  );
}

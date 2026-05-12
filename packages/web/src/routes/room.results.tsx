import {useEffect} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import {DisplayRail} from "../features/display/DisplayRails";
import {useDisplayRoom} from "../features/display/DisplayRoomView";
import {
  activeGameMatchesQueryOptions,
  activeGameStinkersQueryOptions,
} from "../features/room/room.queries";

export const Route = createFileRoute("/room/results")({
  component: DisplayRoomResultsView,
});

function DisplayRoomResultsView() {
  const {gameCode, lastDisplayMessage} = useDisplayRoom();
  const queryClient = useQueryClient();
  const matchesQuery = useQuery(activeGameMatchesQueryOptions(gameCode));
  const stinkersQuery = useQuery(activeGameStinkersQueryOptions(gameCode));

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
      <DisplayRail
        title="Final Matches"
        items={matchesQuery.data?.items ?? []}
        tone="match"
      />
      <DisplayRail
        title="Stinkers"
        items={stinkersQuery.data?.items ?? []}
        tone="stinker"
      />
    </div>
  );
}

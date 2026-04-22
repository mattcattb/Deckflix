import {createFileRoute, redirect} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {PlayerRoomView} from "../features/room/room-views";
import {activeRoomClientQueryOptions} from "../lib/games";

export const Route = createFileRoute("/play")({
  beforeLoad: async ({context}) => {
    const session = await context.queryClient.ensureQueryData(
      activeRoomClientQueryOptions,
    );

    if (session.role === "none") {
      throw redirect({to: "/", replace: true});
    }

    if (session.role === "display") {
      throw redirect({to: "/room", replace: true});
    }
  },
  loader: ({context}) =>
    context.queryClient.ensureQueryData(activeRoomClientQueryOptions),
  component: ActivePlayPage,
});

function ActivePlayPage() {
  const activeSessionQuery = useQuery(activeRoomClientQueryOptions);

  if (
    activeSessionQuery.isLoading ||
    !activeSessionQuery.data ||
    activeSessionQuery.data.role !== "player"
  ) {
    return null;
  }

  return (
    <PlayerRoomView
      gameCode={activeSessionQuery.data.gameCode}
      onSessionChange={() => void activeSessionQuery.refetch()}
      scopedToActiveRoom
    />
  );
}

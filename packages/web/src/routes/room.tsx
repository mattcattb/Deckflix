import {Outlet, createFileRoute, redirect, useLocation} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {DisplayRoomView} from "../features/room/room-views";
import {activeRoomClientQueryOptions} from "../lib/games";

export const Route = createFileRoute("/room")({
  beforeLoad: async ({context, location}) => {
    if (location.pathname !== "/room") {
      return;
    }

    const session = await context.queryClient.ensureQueryData(
      activeRoomClientQueryOptions,
    );

    if (session.role === "none") {
      throw redirect({to: "/", replace: true});
    }

    if (session.role === "player") {
      throw redirect({to: "/play", replace: true});
    }
  },
  loader: ({context, location}) =>
    location.pathname === "/room"
      ? context.queryClient.ensureQueryData(activeRoomClientQueryOptions)
      : null,
  component: ActiveRoomPage,
});

function ActiveRoomPage() {
  const location = useLocation();
  const isExactRoomRoute = location.pathname === "/room";
  const activeSessionQuery = useQuery({
    ...activeRoomClientQueryOptions,
    enabled: isExactRoomRoute,
  });

  if (!isExactRoomRoute) {
    return <Outlet />;
  }

  if (
    activeSessionQuery.isLoading ||
    !activeSessionQuery.data ||
    activeSessionQuery.data.role !== "display"
  ) {
    return null;
  }

  return (
    <DisplayRoomView
      gameCode={activeSessionQuery.data.gameCode}
      onSessionChange={() => void activeSessionQuery.refetch()}
      scopedToActiveRoom
    />
  );
}

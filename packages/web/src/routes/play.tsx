import type {QueryClient} from "@tanstack/react-query";
import {createFileRoute, redirect} from "@tanstack/react-router";
import {PlayerRoomView} from "../features/room";
import {
  activeRoomClientQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  activeRoomResultsQueryOptions,
  activePlayerStateQueryOptions,
} from "../lib/games";

const getPlayerClient = async (queryClient: QueryClient) => {
  const activeClient = await queryClient.ensureQueryData(
    activeRoomClientQueryOptions,
  );

  if (activeClient.role === "none") {
    throw redirect({to: "/", replace: true});
  }

  if (activeClient.role === "display") {
    throw redirect({to: "/room", replace: true});
  }

  return activeClient;
};

export const Route = createFileRoute("/play")({
  beforeLoad: ({context}) => getPlayerClient(context.queryClient),
  loader: async ({context}) => {
    const activeClient = await getPlayerClient(context.queryClient);

    await Promise.all([
      context.queryClient.prefetchQuery(
        activeRoomMetaQueryOptions(activeClient.gameCode),
      ),
      context.queryClient.prefetchQuery(
        activeRoomPlayersQueryOptions(activeClient.gameCode),
      ),
      context.queryClient.prefetchQuery(
        activeRoomResultsQueryOptions(activeClient.gameCode),
      ),
      context.queryClient.prefetchQuery(
        activePlayerStateQueryOptions(activeClient.gameCode),
      ),
    ]);

    return activeClient;
  },
  component: ActivePlayPage,
});

function ActivePlayPage() {
  const activeClient = Route.useLoaderData();
  return <PlayerRoomView gameCode={activeClient.gameCode} />;
}

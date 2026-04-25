import type {QueryClient} from "@tanstack/react-query";
import {createFileRoute, redirect} from "@tanstack/react-router";
import {PlayerRoomView} from "../features/room";
import {
  clearActiveRoomSession,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
  activeRoomResultsQueryOptions,
  activePlayerStateQueryOptions,
  isMissingRoomSessionError,
  waitForActiveRoomClient,
} from "../lib/games";

const getPlayerClient = async (queryClient: QueryClient) => {
  const activeClient = await waitForActiveRoomClient(queryClient);

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

    try {
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
    } catch (error) {
      if (isMissingRoomSessionError(error)) {
        await clearActiveRoomSession(context.queryClient, activeClient.gameCode);
        throw redirect({to: "/", replace: true});
      }

      throw error;
    }

    return activeClient;
  },
  component: ActivePlayPage,
});

function ActivePlayPage() {
  const activeClient = Route.useLoaderData();
  return <PlayerRoomView gameCode={activeClient.gameCode} />;
}

import type {QueryClient} from "@tanstack/react-query";
import {createFileRoute, redirect} from "@tanstack/react-router";
import {DisplayRoomView} from "../features/room";
import {
  activeDisplayStateQueryOptions,
  activeRoomClientQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
} from "../lib/games";

const getDisplayClient = async (queryClient: QueryClient) => {
  const activeClient = await queryClient.ensureQueryData(
    activeRoomClientQueryOptions,
  );

  if (activeClient.role === "none") {
    throw redirect({to: "/", replace: true});
  }

  if (activeClient.role === "player") {
    throw redirect({to: "/play", replace: true});
  }

  return activeClient;
};

export const Route = createFileRoute("/room")({
  beforeLoad: ({context}) => getDisplayClient(context.queryClient),
  loader: async ({context}) => {
    const activeClient = await getDisplayClient(context.queryClient);

    await Promise.all([
      context.queryClient.prefetchQuery(
        activeRoomMetaQueryOptions(activeClient.gameCode),
      ),
      context.queryClient.prefetchQuery(
        activeRoomPlayersQueryOptions(activeClient.gameCode),
      ),
      context.queryClient.prefetchQuery(
        activeDisplayStateQueryOptions(activeClient.gameCode),
      ),
    ]);

    return activeClient;
  },
  component: ActiveRoomPage,
});

function ActiveRoomPage() {
  const activeClient = Route.useLoaderData();
  return <DisplayRoomView gameCode={activeClient.gameCode} />;
}

import type {QueryClient} from "@tanstack/react-query";
import {createFileRoute, redirect} from "@tanstack/react-router";
import {DisplayRoomShell} from "../features/room";
import {
  activeDisplayStateQueryOptions,
  activeRoomMetaQueryOptions,
  activeRoomPlayersQueryOptions,
} from "../features/room/room.queries";
import {
  activeGamePreferencesQueryOptions,
  activeRoomSettingsQueryOptions,
} from "../features/preferences/preferences.queries";
import {
  clearActiveRoomSession,
  isMissingRoomSessionError,
  waitForActiveRoomClient,
} from "../features/room/room-session";

const getDisplayClient = async (queryClient: QueryClient) => {
  const activeClient = await waitForActiveRoomClient(queryClient);

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

    try {
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
        context.queryClient.prefetchQuery(
          activeRoomSettingsQueryOptions(activeClient.gameCode),
        ),
        context.queryClient.prefetchQuery(
          activeGamePreferencesQueryOptions(activeClient.gameCode),
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
  component: ActiveRoomPage,
});

function ActiveRoomPage() {
  const activeClient = Route.useLoaderData();
  return <DisplayRoomShell gameCode={activeClient.gameCode} />;
}

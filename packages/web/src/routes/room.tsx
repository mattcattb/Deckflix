import {createFileRoute, redirect} from "@tanstack/react-router";
import type {GameSettings} from "@deckflix/shared";
import {DisplayRoomShell} from "../features/display/DisplayRoomView";
import {
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
} from "../features/room/room-session";
import {requireDisplayRoom} from "./-room-route-guards";

export const Route = createFileRoute("/room")({
  beforeLoad: ({context}) => requireDisplayRoom(context.activeClient),
  loader: async ({context}) => {
    const activeClient = requireDisplayRoom(context.activeClient);

    try {
      const [meta] = await Promise.all([
        context.queryClient.fetchQuery(
          activeRoomMetaQueryOptions(activeClient.gameCode),
        ),
        context.queryClient.prefetchQuery(
          activeRoomPlayersQueryOptions(activeClient.gameCode),
        ),
        context.queryClient.prefetchQuery(
          activeGamePreferencesQueryOptions(activeClient.gameCode),
        ),
      ]);
      context.queryClient.setQueryData<GameSettings>(
        activeRoomSettingsQueryOptions(activeClient.gameCode).queryKey,
        meta.settings,
      );
    } catch (error) {
      if (isMissingRoomSessionError(error)) {
        await clearActiveRoomSession(
          context.queryClient,
          activeClient.gameCode,
        );
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

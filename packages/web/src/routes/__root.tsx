import type {QueryClient} from "@tanstack/react-query";
import {createRootRouteWithContext, Outlet} from "@tanstack/react-router";
import type {ActiveRoomClient} from "@deckflix/shared";
import {ToastProvider} from "../components/ui";
import {activeRoomClientQueryOptions} from "../features/room/room-session";

export const Route = createRootRouteWithContext<{
  activeClient?: ActiveRoomClient;
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({context}) => {
    const activeClient = await context.queryClient.ensureQueryData(
      activeRoomClientQueryOptions,
    );

    return {activeClient};
  },
  component: RootLayout,
});

function RootLayout() {
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <Outlet />
      </div>
    </ToastProvider>
  );
}

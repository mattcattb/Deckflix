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
  pendingComponent: AppPendingScreen,
  errorComponent: AppErrorScreen,
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

function AppPendingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-6 text-center">
      <div>
        <div className="netflix-wordmark text-3xl">Deckflix</div>
        <div className="mx-auto mt-5 h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[shimmer_1s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>
    </main>
  );
}

function AppErrorScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-6 text-center">
      <div className="max-w-sm">
        <div className="netflix-wordmark text-3xl">Deckflix</div>
        <h1 className="mt-6 text-2xl font-bold">That scene didn&apos;t load.</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          Your room is still safe. Reconnect and we&apos;ll pick up where you left off.
        </p>
        <button
          type="button"
          className="mt-6 h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-[hsl(357_92%_52%)]"
          onClick={() => window.location.reload()}>
          Reconnect
        </button>
      </div>
    </main>
  );
}

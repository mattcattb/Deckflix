import type {QueryClient} from "@tanstack/react-query";
import {createRootRouteWithContext, Outlet} from "@tanstack/react-router";
import {ToastProvider} from "../components/ui";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
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

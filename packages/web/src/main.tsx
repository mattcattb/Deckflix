import React from "react";
import ReactDOM from "react-dom/client";
import {RouterProvider, createRouter} from "@tanstack/react-router";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import {ToastProvider} from "./components/ui";
import {hasRpcErrorCode} from "./lib/api";
import {captureClientError} from "./lib/telemetry";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !hasRpcErrorCode(
          error,
          "BAD_REQUEST",
          "CONFLICT",
          "FORBIDDEN",
          "NOT_FOUND",
          "UNAUTHORIZED",
          "VALIDATION_ERROR",
        ) && failureCount < 2,
    },
    mutations: {retry: false},
  },
});

const router = createRouter({
  routeTree,
  context: {queryClient},
  defaultPreload: "intent",
});

window.addEventListener("error", (event) => {
  captureClientError(event.error ?? event.message, "window.error");
});
window.addEventListener("unhandledrejection", (event) => {
  captureClientError(event.reason, "unhandledrejection");
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

import {api} from "./api";

type ProductEventName =
  | "landing_viewed"
  | "room_create_started"
  | "room_create_succeeded"
  | "room_create_failed"
  | "room_join_started"
  | "room_join_succeeded"
  | "room_join_failed"
  | "game_started"
  | "finale_started"
  | "client_error";

export const captureProductEvent = (
  name: ProductEventName,
  properties?: Record<string, string | number | boolean | null>,
) => {
  if (typeof window === "undefined") return;

  void api.api.telemetry
    .$post({
      json: {name, path: window.location.pathname, properties},
    })
    .catch(() => undefined);
};

export const captureClientError = (error: unknown, source: string) => {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : String(error);
  captureProductEvent("client_error", {
    source,
    message: message.slice(0, 300),
  });
};

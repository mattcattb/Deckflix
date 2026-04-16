import { hc } from "hono/client";
import type { AppType } from "@deckflix/server/app";

const rawBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3100";

export const API_BASE_URL = rawBaseUrl.startsWith("http")
  ? rawBaseUrl
  : `http://${rawBaseUrl}`;

export const api = hc<AppType>(API_BASE_URL, {
  init: {
    credentials: "include",
  },
});

const readErrorPayload = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const json = await response.json();
      if (
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof json.error === "object" &&
        json.error !== null
      ) {
        const error = json.error as {message?: unknown; code?: unknown};
        if (typeof error.message === "string") {
          return error.message;
        }
        if (typeof error.code === "string") {
          return error.code;
        }
      }

      return JSON.stringify(json);
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
};

export const throwApiError = async (
  response: Response,
  requestLabel?: string,
): Promise<never> => {
  const payload = await readErrorPayload(response);
  const label = requestLabel ?? `${response.url || "request"} (${response.status})`;
  const message = payload ?? response.statusText ?? "Request failed";
  throw new Error(`${label}: ${message}`);
};

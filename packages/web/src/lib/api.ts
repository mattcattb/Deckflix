import { hc } from "hono/client";
import type { AppType } from "@matty-stack/server/app";

const rawBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const API_BASE_URL = rawBaseUrl.startsWith("http")
  ? rawBaseUrl
  : `http://${rawBaseUrl}`;

export const api = hc<AppType>(API_BASE_URL, {
  init: {
    credentials: "include",
  },
});

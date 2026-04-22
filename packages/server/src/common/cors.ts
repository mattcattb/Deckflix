import {cors} from "hono/cors";
import {appEnv} from "./env";

const allowedOrigins = (appEnv.CORS_ORIGINS || appEnv.BETTER_AUTH_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isLocalhostOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) {
      return null;
    }

    return allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin) ||
      (appEnv.NODE_ENV !== "production" && isLocalhostOrigin(origin))
      ? origin
      : null;
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400, // 24 hours
});

import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: (origin) => origin ?? "*",
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400, // 24 hours
});

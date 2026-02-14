import { cors } from "hono/cors";

import {appEnv} from "./env";

const ALLOWED_ORIGINS = appEnv.CORS_ORIGINS?.split(",") || [
  "http://localhost:5173",
  "http://localhost:3000",
];

export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400, // 24 hours
});

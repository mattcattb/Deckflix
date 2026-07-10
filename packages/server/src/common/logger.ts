import {pinoLogger} from "hono-pino";
import pino from "pino";
import {appEnv} from "./env";

const transport =
  appEnv.NODE_ENV !== "production"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined;

const pinoInstance = pino({
  formatters: {
    level(label) {
      return {level: label};
    },
  },
  base: {
    app: process.env.APP_NAME,
  },
  level: appEnv.LOG_LEVEL || (appEnv.NODE_ENV === "test" ? "error" : "info"),
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req(request: Record<string, unknown>) {
      const headers = {...(request.headers as Record<string, unknown> | undefined)};
      if ("authorization" in headers) headers.authorization = "[REDACTED]";
      if ("cookie" in headers) headers.cookie = "[REDACTED]";
      let url = request.url;
      if (typeof url === "string" && url.includes("roomSessionToken=")) {
        const parsed = new URL(url, "http://deckflix.local");
        parsed.searchParams.delete("roomSessionToken");
        url = `${parsed.pathname}${parsed.search}`;
      }
      return {...request, url, headers};
    },
    res(response: Record<string, unknown>) {
      const headers = {...(response.headers as Record<string, unknown> | undefined)};
      if ("set-cookie" in headers) headers["set-cookie"] = "[REDACTED]";
      return {...response, headers};
    },
  },
  transport,
});

export function getPinoLogger() {
  return pinoLogger({
    pino: pinoInstance,
  });
}

export const logger = pinoInstance;

export function createChildLogger(bindings: pino.Bindings) {
  return logger.child(bindings);
}

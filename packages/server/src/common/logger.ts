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

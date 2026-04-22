import type {RoomSession} from "@deckflix/shared";
import {Hono} from "hono";
import type {GameMetaRecord} from "../rooms/room-meta.service";
import {corsMiddleware} from "./cors";
import {createChildLogger, getPinoLogger} from "./logger";
import {ZodError} from "zod/v4";
import {
  ERROR_MESSAGES,
  formatErrorResponse,
  isPostgresError,
  ServiceException,
  ValidationException,
} from "./errors";
import {HTTPException} from "hono/http-exception";

declare module "hono" {
  interface ContextVariableMap {
    room: {
      gameCode: string;
      session: RoomSession | null;
      meta: GameMetaRecord;
    };
    userId: string;
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
    };
    session: {
      id: string;
      expiresAt: Date;
    };
    displayActor: {
      displayId: string;
      sessionToken: string;
    };
    playerActor: {
      playerId: string;
      sessionToken: string;
    };
  }
}

export const createRouter = () => {
  return new Hono({
    strict: true,
  });
};

export const addGlobalMiddlewares = (app: Hono) => {
  app
    .use("*", getPinoLogger())
    .use("*", corsMiddleware)
    .get("/health", (c) =>
      c.json({status: "ok", timestamp: new Date().toISOString()}),
    );
};

const logger = createChildLogger({service: "global.app.handler"});

export const addGlobalErrorHandling = (app: Hono) => {
  app.onError((err, c) => {
    if (err instanceof ZodError) {
      const validation = new ValidationException(
        ERROR_MESSAGES.VALIDATION_ERROR,
        err.flatten(),
      );
      const payload = formatErrorResponse(validation);
      return c.json({error: payload}, validation.status);
    }

    if (isPostgresError(err)) {
      logger.error({err}, "Database error");
      const dbError = new ServiceException(ERROR_MESSAGES.SERVICE_ERROR, {
        code: err.code,
        detail: (err as {detail?: string}).detail,
      });
      const payload = formatErrorResponse(dbError);
      return c.json({error: payload}, dbError.status);
    }

    if (err instanceof HTTPException) {
      const payload = formatErrorResponse(err);
      return c.json({error: payload}, err.status);
    }

    logger.error({err}, "Unhandled error");

    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: ERROR_MESSAGES.INTERNAL_ERROR,
        },
      },
      500,
    );
  });
};

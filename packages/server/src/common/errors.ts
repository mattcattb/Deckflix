import type {Context, Hono} from "hono";
import {HTTPException} from "hono/http-exception";
import {ZodError} from "zod";
import type {PostgresError} from "postgres";
import {logger} from "./logger";
import type {ContentfulStatusCode} from "hono/utils/http-status";

export const ERROR_MESSAGES = {
  BAD_REQUEST: "Bad request",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not found",
  VALIDATION_ERROR: "Validation failed",
  SERVICE_ERROR: "Service error",
  INTERNAL_ERROR: "Internal server error",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  422: "VALIDATION_ERROR",
  500: "INTERNAL_ERROR",
};

export class AppHttpError extends HTTPException {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message?: string,
    details?: unknown,
  ) {
    super(status, {message: message ?? ERROR_MESSAGES[code]});
    this.code = code;
    this.details = details;
  }
}

export class BadRequestException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(403, "FORBIDDEN", message, details);
  }
}

// Requested default 400 for NotFoundException (override if needed)
export class NotFoundException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ValidationException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(422, "VALIDATION_ERROR", message, details);
  }
}

export class ServiceException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(500, "SERVICE_ERROR", message, details);
  }
}

const isPostgresError = (err: unknown): err is PostgresError =>
  typeof err === "object" &&
  err !== null &&
  ("code" in err || "severity" in err) &&
  (err as {name?: string}).name === "PostgresError";

const formatErrorResponse = (err: HTTPException) => {
  if (err instanceof AppHttpError) {
    return {
      code: err.code,
      message: err.message || ERROR_MESSAGES[err.code],
      details: err.details,
    };
  }

  const code = STATUS_TO_CODE[err.status] ?? "INTERNAL_ERROR";
  return {
    code,
    message: err.message || ERROR_MESSAGES[code],
  };
};

export const addErrorHandling = (app: Hono) => {
  app.onError((err, c: Context) => {
    if (err instanceof ZodError) {
      const validation = new BadRequestException(
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

  return app;
};

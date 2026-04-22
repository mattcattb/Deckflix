import {HTTPException} from "hono/http-exception";
import type {PostgresError} from "postgres";
import type {ContentfulStatusCode} from "hono/utils/http-status";
import {
  ERROR_MESSAGES,
  type ApiError,
  type ApiErrorCode,
  type ApiErrorResponse,
} from "@deckflix/shared";

export {ERROR_MESSAGES} from "@deckflix/shared";

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  409: "CONFLICT",
  404: "NOT_FOUND",
  422: "VALIDATION_ERROR",
  500: "INTERNAL_ERROR",
};

export class AppHttpError extends HTTPException {
  public readonly code: ApiErrorCode;
  public readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: ApiErrorCode,
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

export class ConflictException extends AppHttpError {
  constructor(message?: string, details?: unknown) {
    super(409, "CONFLICT", message, details);
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

export const isPostgresError = (err: unknown): err is PostgresError =>
  typeof err === "object" &&
  err !== null &&
  ("code" in err || "severity" in err) &&
  (err as {name?: string}).name === "PostgresError";

export const formatErrorResponse = (err: HTTPException): ApiError => {
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

export type GlobalErrorResponses = {
  400: {json: ApiErrorResponse};
  401: {json: ApiErrorResponse};
  403: {json: ApiErrorResponse};
  404: {json: ApiErrorResponse};
  409: {json: ApiErrorResponse};
  422: {json: ApiErrorResponse};
  500: {json: ApiErrorResponse};
};

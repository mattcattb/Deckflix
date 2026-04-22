import {z} from "zod";

export const ERROR_MESSAGES = {
  BAD_REQUEST: "Bad request",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  CONFLICT: "Conflict",
  NOT_FOUND: "Not found",
  VALIDATION_ERROR: "Validation failed",
  SERVICE_ERROR: "Service error",
  INTERNAL_ERROR: "Internal server error",
} as const;

const errorCodeValues = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "SERVICE_ERROR",
  "INTERNAL_ERROR",
] as const;

const apiErrorCodeSchema = z.enum(errorCodeValues);

const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

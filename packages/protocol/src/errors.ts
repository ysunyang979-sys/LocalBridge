import { z } from "zod";

export const LocalBridgeErrorCode = {
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  PATH_NOT_ALLOWED: "PATH_NOT_ALLOWED",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  BINARY_FILE: "BINARY_FILE",
  COMMAND_BLOCKED: "COMMAND_BLOCKED",
  COMMAND_TIMEOUT: "COMMAND_TIMEOUT",
  RUNNER_OFFLINE: "RUNNER_OFFLINE",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  PATCH_CONFLICT: "PATCH_CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type LocalBridgeErrorCode =
  (typeof LocalBridgeErrorCode)[keyof typeof LocalBridgeErrorCode];

export const LocalBridgeErrorSchema = z.object({
  code: z.nativeEnum(LocalBridgeErrorCode),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type LocalBridgeErrorPayload = z.infer<typeof LocalBridgeErrorSchema>;

export class LocalBridgeError extends Error {
  readonly code: LocalBridgeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: LocalBridgeErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LocalBridgeError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): LocalBridgeErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

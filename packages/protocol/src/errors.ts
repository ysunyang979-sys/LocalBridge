import { z } from "zod";

export const LocalBridgeErrorCode = {
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  PROJECT_DISABLED: "PROJECT_DISABLED",
  PROJECT_ALREADY_EXISTS: "PROJECT_ALREADY_EXISTS",
  PROJECT_ROOT_NOT_FOUND: "PROJECT_ROOT_NOT_FOUND",
  PROJECT_ROOT_NOT_DIRECTORY: "PROJECT_ROOT_NOT_DIRECTORY",
  PATH_NOT_ALLOWED: "PATH_NOT_ALLOWED",
  PATH_TRAVERSAL: "PATH_TRAVERSAL",
  PATH_SYMLINK_ESCAPE: "PATH_SYMLINK_ESCAPE",
  PATH_UNC_NOT_ALLOWED: "PATH_UNC_NOT_ALLOWED",
  PATH_DEVICE_NOT_ALLOWED: "PATH_DEVICE_NOT_ALLOWED",
  PATH_ADS_NOT_ALLOWED: "PATH_ADS_NOT_ALLOWED",
  PATH_INVALID_WINDOWS_NAME: "PATH_INVALID_WINDOWS_NAME",
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
  PROTOCOL_VERSION_UNSUPPORTED: "PROTOCOL_VERSION_UNSUPPORTED",
  RPC_TIMEOUT: "RPC_TIMEOUT",
  RUNNER_DISCONNECTED: "RUNNER_DISCONNECTED",
  RUNNER_BUSY: "RUNNER_BUSY",
  RPC_MESSAGE_TOO_LARGE: "RPC_MESSAGE_TOO_LARGE",
  RPC_INVALID_RESPONSE: "RPC_INVALID_RESPONSE",
  RPC_REMOTE_ERROR: "RPC_REMOTE_ERROR",
} as const;

export type LocalBridgeErrorCode =
  (typeof LocalBridgeErrorCode)[keyof typeof LocalBridgeErrorCode];

export const JsonRpcStandardErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  DuplicateRequestId: -32001,
} as const;

export type JsonRpcStandardErrorCode =
  (typeof JsonRpcStandardErrorCode)[keyof typeof JsonRpcStandardErrorCode];

export class RemoteRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RemoteRpcError";
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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

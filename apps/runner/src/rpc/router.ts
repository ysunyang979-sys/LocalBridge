import {
  JsonRpcStandardErrorCode,
  MAX_RPC_MESSAGE_SIZE,
  RunnerRpcSchemas,
  type RunnerRpcMethodName,
  type JsonRpcResponse,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export type RpcHandler<TParams = unknown, TResult = unknown> = (
  params: TParams
) => Promise<TResult> | TResult;

export class RpcRouter {
  private readonly handlers = new Map<string, RpcHandler>();
  private readonly activeRequestIds = new Set<string>();

  constructor(private readonly logger?: Logger) {}

  register<TParams, TResult>(
    method: string,
    handler: RpcHandler<TParams, TResult>
  ): void {
    this.handlers.set(method, handler as RpcHandler);
  }

  has(method: string): boolean {
    return this.handlers.has(method);
  }

  async handle(data: string | Buffer): Promise<JsonRpcResponse | null> {
    const rawLen = typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length;
    if (rawLen > MAX_RPC_MESSAGE_SIZE) {
      this.logger?.warn(
        { event: "rpc_invalid_message", reason: "message_too_large", size: rawLen },
        `RPC message exceeds maximum allowed size (${MAX_RPC_MESSAGE_SIZE} bytes)`
      );
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JsonRpcStandardErrorCode.InvalidRequest,
          message: "Request exceeds maximum allowed size",
        },
      };
    }

    let parsed: Record<string, unknown>;
    try {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger?.warn(
        { event: "rpc_invalid_message", reason: "parse_error" },
        "Failed to parse incoming RPC JSON message"
      );
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JsonRpcStandardErrorCode.ParseError,
          message: "Parse error",
        },
      };
    }

    // Check JSON-RPC 2.0 structure
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.jsonrpc !== "2.0" ||
      !("id" in parsed) ||
      (typeof parsed.id !== "string" && typeof parsed.id !== "number") ||
      typeof parsed.method !== "string"
    ) {
      this.logger?.warn(
        { event: "rpc_invalid_message", reason: "invalid_jsonrpc_structure" },
        "Invalid JSON-RPC request structure"
      );
      const safeId = (typeof parsed?.id === "string" || typeof parsed?.id === "number") ? parsed.id : null;
      return {
        jsonrpc: "2.0",
        id: safeId,
        error: {
          code: JsonRpcStandardErrorCode.InvalidRequest,
          message: "Invalid Request",
        },
      };
    }

    const { id, method } = parsed;
    const strId = String(id);

    // Duplicate in-flight ID check
    if (this.activeRequestIds.has(strId)) {
      this.logger?.warn(
        { event: "rpc_duplicate_request_id", request_id: id },
        `Duplicate in-flight request ID "${id}" detected`
      );
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcStandardErrorCode.DuplicateRequestId,
          message: "Duplicate request ID",
        },
      };
    }

    const handler = this.handlers.get(method);
    if (!handler) {
      this.logger?.warn(
        { event: "rpc_unknown_method", method, request_id: id },
        `Received unknown RPC method: "${method}"`
      );
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcStandardErrorCode.MethodNotFound,
          message: "Method not found",
        },
      };
    }

    // Validate params
    const methodSchema = RunnerRpcSchemas[method as RunnerRpcMethodName];
    if (methodSchema?.params) {
      const val = methodSchema.params.safeParse(parsed.params ?? {});
      if (!val.success) {
        this.logger?.warn(
          {
            event: "rpc_invalid_params",
            method,
            request_id: id,
            errors: val.error.flatten(),
          },
          `Invalid parameters for method "${method}"`
        );
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: JsonRpcStandardErrorCode.InvalidParams,
            message: "Invalid params",
            data: val.error.flatten(),
          },
        };
      }
    }

    this.activeRequestIds.add(strId);
    const start = Date.now();

    try {
      const result = await handler(parsed.params ?? {});
      const duration = Date.now() - start;

      this.logger?.info(
        {
          event: "rpc_request_executed",
          method,
          request_id: id,
          duration_ms: duration,
          result_status: "success",
        },
        `Executed RPC method "${method}" successfully (${duration}ms)`
      );

      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    } catch (err) {
      const duration = Date.now() - start;
      // Log complete details locally, never leak stack trace or paths to remote
      this.logger?.error(
        {
          err,
          method,
          request_id: id,
          duration_ms: duration,
          result_status: "error",
        },
        `RPC handler failed for method "${method}"`
      );

      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcStandardErrorCode.InternalError,
          message: "Internal error",
        },
      };
    } finally {
      this.activeRequestIds.delete(strId);
    }
  }
}

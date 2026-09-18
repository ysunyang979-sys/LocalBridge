import { describe, it, expect } from "vitest";
import {
  RunnerRpcMethods,
  SystemPingParamsSchema,
  SystemPingResultSchema,
  SystemInfoParamsSchema,
  SystemInfoResultSchema,
  RunnerRpcSchemas,
  JsonRpcRequestSchema,
  JsonRpcResponseSchema,
  JsonRpcResponseErrorSchema,
  JsonRpcStandardErrorCode,
  LocalBridgeErrorCode,
  RemoteRpcError,
  generateRequestId,
  MAX_RPC_MESSAGE_SIZE,
  MAX_PENDING_REQUESTS,
} from "@localbridge/protocol";

describe("RPC Protocol Definitions & Schemas", () => {
  it("defines standard RunnerRpcMethods constants", () => {
    expect(RunnerRpcMethods.Hello).toBe("runner.hello");
    expect(RunnerRpcMethods.SystemPing).toBe("system.ping");
    expect(RunnerRpcMethods.SystemInfo).toBe("system.info");
  });

  it("generates unique request IDs with req_<uuid> format", () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).toMatch(/^req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id2).toMatch(/^req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id1).not.toBe(id2);
  });

  it("validates system.ping params and result schemas", () => {
    const validParams = {};
    expect(SystemPingParamsSchema.safeParse(validParams).success).toBe(true);

    // Strict params rejects unexpected properties
    expect(SystemPingParamsSchema.safeParse({ extra: "bad" }).success).toBe(false);

    const validResult = {
      pong: true,
      timestamp: Date.now(),
      runnerId: "runner-123",
    };
    expect(SystemPingResultSchema.safeParse(validResult).success).toBe(true);

    // Incomplete or invalid result rejected
    expect(SystemPingResultSchema.safeParse({ pong: false, timestamp: 123, runnerId: "r1" }).success).toBe(false);
    expect(SystemPingResultSchema.safeParse({ pong: true }).success).toBe(false);
  });

  it("validates system.info params and result schemas", () => {
    expect(SystemInfoParamsSchema.safeParse({}).success).toBe(true);
    expect(SystemInfoParamsSchema.safeParse({ unexpected: 123 }).success).toBe(false);

    const validResult = {
      runnerId: "runner-abc",
      runnerVersion: "0.3.0",
      protocolVersion: "1.0",
      platform: "win32",
      arch: "x64",
      hostname: "DESKTOP-TEST",
      nodeVersion: "v22.14.0",
      capabilities: {
        filesystem: true,
        shell: false,
        git: true,
        build: false,
        test: false,
        docker: false,
      },
      tools: {
        git: "2.48.1",
        node: "22.14.0",
        npm: "10.9.0",
        pnpm: "10.0.0",
        python: null,
        docker: null,
      },
    };
    expect(SystemInfoResultSchema.safeParse(validResult).success).toBe(true);

    // Missing capabilities rejected
    const { capabilities: _, ...missingCaps } = validResult;
    expect(SystemInfoResultSchema.safeParse(missingCaps).success).toBe(false);

    // Incomplete tools (missing required tool key) rejected
    const invalidTools = {
      ...validResult,
      tools: { git: "2.48.1" }, // missing node, npm, pnpm, python, docker
    };
    expect(SystemInfoResultSchema.safeParse(invalidTools).success).toBe(false);
  });

  it("validates standard JSON-RPC 2.0 requests via JsonRpcRequestSchema", () => {
    const validReq = {
      jsonrpc: "2.0",
      id: generateRequestId(),
      method: RunnerRpcMethods.SystemPing,
      params: {},
    };
    expect(JsonRpcRequestSchema.safeParse(validReq).success).toBe(true);

    // Invalid jsonrpc version
    expect(JsonRpcRequestSchema.safeParse({ ...validReq, jsonrpc: "1.0" }).success).toBe(false);

    // Missing id
    expect(JsonRpcRequestSchema.safeParse({ jsonrpc: "2.0", method: "system.ping" }).success).toBe(false);

    // Missing method
    expect(JsonRpcRequestSchema.safeParse({ jsonrpc: "2.0", id: "req_123" }).success).toBe(false);
  });

  it("validates standard JSON-RPC 2.0 success and error responses", () => {
    const validSuccess = {
      jsonrpc: "2.0",
      id: generateRequestId(),
      result: { pong: true, timestamp: 12345, runnerId: "r1" },
    };
    expect(JsonRpcResponseSchema.safeParse(validSuccess).success).toBe(true);

    const validError = {
      jsonrpc: "2.0",
      id: generateRequestId(),
      error: {
        code: JsonRpcStandardErrorCode.MethodNotFound,
        message: "Method not found",
      },
    };
    expect(JsonRpcResponseErrorSchema.safeParse(validError).success).toBe(true);
  });

  it("validates RemoteRpcError instance", () => {
    const err = new RemoteRpcError(JsonRpcStandardErrorCode.InternalError, "Handler failed", { hint: "check log" });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(-32603);
    expect(err.message).toBe("Handler failed");
    expect(err.data).toEqual({ hint: "check log" });
  });

  it("enforces constants for limits", () => {
    expect(MAX_RPC_MESSAGE_SIZE).toBe(1048576);
    expect(MAX_PENDING_REQUESTS).toBe(64);
  });
});

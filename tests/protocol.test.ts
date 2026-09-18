import { describe, it, expect } from "vitest";
import {
  PROTOCOL_VERSION,
  LocalBridgeErrorCode,
  LocalBridgeError,
  LocalBridgeErrorSchema,
  JsonRpcRequestSchema,
  JsonRpcResponseSuccessSchema,
  JsonRpcResponseErrorSchema,
  RunnerMethod,
  RunnerCapabilitiesSchema,
  RunnerSystemInfoSchema,
  ProjectSchema,
  ProjectPublicSchema,
} from "@localbridge/protocol";

describe("Protocol Package", () => {
  it("exports correct protocol version", () => {
    expect(PROTOCOL_VERSION).toBe("1.0");
  });

  it("handles LocalBridgeError serialization and schema validation", () => {
    const error = new LocalBridgeError(
      LocalBridgeErrorCode.PATH_NOT_ALLOWED,
      "Path escapes project boundary",
      { attemptedPath: "../secret.txt" }
    );

    const json = error.toJSON();
    expect(json.code).toBe("PATH_NOT_ALLOWED");
    expect(json.message).toBe("Path escapes project boundary");
    expect(json.details?.attemptedPath).toBe("../secret.txt");

    const validated = LocalBridgeErrorSchema.safeParse(json);
    expect(validated.success).toBe(true);
  });

  it("validates JSON-RPC 2.0 Request Schema", () => {
    const validRequest = {
      jsonrpc: "2.0",
      id: "req_001",
      method: RunnerMethod.FILE_READ,
      params: {
        projectId: "proj_123",
        path: "src/index.ts",
      },
    };

    const result = JsonRpcRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);

    const invalidRequest = {
      jsonrpc: "1.0", // invalid version
      id: "req_002",
      method: "test",
    };
    expect(JsonRpcRequestSchema.safeParse(invalidRequest).success).toBe(false);
  });

  it("validates JSON-RPC 2.0 Responses", () => {
    const successResponse = {
      jsonrpc: "2.0",
      id: "req_001",
      result: { content: "hello world", size: 11 },
    };
    expect(JsonRpcResponseSuccessSchema.safeParse(successResponse).success).toBe(true);

    const errorResponse = {
      jsonrpc: "2.0",
      id: "req_001",
      error: {
        code: -32600,
        message: "Invalid Request",
      },
    };
    expect(JsonRpcResponseErrorSchema.safeParse(errorResponse).success).toBe(true);
  });

  it("validates RunnerCapabilities schema defaults", () => {
    const caps = RunnerCapabilitiesSchema.parse({});
    expect(caps.filesystem).toBe(true);
    expect(caps.shell).toBe(true);
    expect(caps.git).toBe(true);
    expect(caps.docker).toBe(false);
  });

  it("validates RunnerSystemInfo schema", () => {
    const sysInfo = {
      platform: "win32",
      arch: "x64",
      hostname: "Dev-PC",
      nodeVersion: "v22.14.0",
      tools: {
        git: "2.46.2",
        node: "22.14.0",
        npm: null,
        pnpm: "10.14.0",
        python: null,
        docker: null,
      },
    };
    const parsed = RunnerSystemInfoSchema.safeParse(sysInfo);
    expect(parsed.success).toBe(true);
  });

  it("redacts internal project root in ProjectPublicSchema", () => {
    const fullProject = {
      id: "proj_abc",
      runnerId: "runner_123",
      name: "my-blog",
      root: "D:\\Projects\\my-blog",
      enabled: true,
      available: true,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    expect(ProjectSchema.safeParse(fullProject).success).toBe(true);

    const publicView = ProjectPublicSchema.parse(fullProject);
    expect("root" in publicView).toBe(false);
    expect(publicView.id).toBe("proj_abc");
    expect(publicView.runnerId).toBe("runner_123");
    expect(publicView.name).toBe("my-blog");
    expect(publicView.available).toBe(true);
  });
});

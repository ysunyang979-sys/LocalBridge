import { describe, it, expect } from "vitest";
import { RpcRouter } from "../apps/runner/src/rpc/router.js";
import { createSystemPingHandler } from "../apps/runner/src/rpc/handlers/system-ping.js";
import { createSystemInfoHandler } from "../apps/runner/src/rpc/handlers/system-info.js";
import {
  RunnerRpcMethods,
  JsonRpcStandardErrorCode,
  MAX_RPC_MESSAGE_SIZE,
} from "@localbridge/protocol";

describe("Runner RpcRouter & Handlers", () => {
  const runnerId = "runner-test-xyz";

  function createRouter(): RpcRouter {
    const router = new RpcRouter();
    router.register(
      RunnerRpcMethods.SystemPing,
      createSystemPingHandler({ runnerId })
    );
    router.register(
      RunnerRpcMethods.SystemInfo,
      createSystemInfoHandler({
        runnerId,
        version: "0.3.0",
        capabilities: {
          filesystem: true,
          shell: true,
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
      })
    );
    return router;
  }

  it("handles system.ping successfully", async () => {
    const router = createRouter();
    const req = JSON.stringify({
      jsonrpc: "2.0",
      id: "req_ping_1",
      method: "system.ping",
      params: {},
    });

    const res = await router.handle(req);
    expect(res).not.toBeNull();
    expect(res?.jsonrpc).toBe("2.0");
    expect(res?.id).toBe("req_ping_1");
    if ("result" in res!) {
      const result = res.result as { pong: boolean; timestamp: number; runnerId: string };
      expect(result.pong).toBe(true);
      expect(typeof result.timestamp).toBe("number");
      expect(result.runnerId).toBe(runnerId);
    } else {
      throw new Error("Expected result in response");
    }
  });

  it("handles system.info successfully without leaking sensitive data", async () => {
    const router = createRouter();
    const req = JSON.stringify({
      jsonrpc: "2.0",
      id: "req_info_1",
      method: "system.info",
      params: {},
    });

    const res = await router.handle(req);
    expect(res).not.toBeNull();
    expect(res?.jsonrpc).toBe("2.0");
    expect(res?.id).toBe("req_info_1");
    if ("result" in res!) {
      const result = res.result as Record<string, unknown>;
      expect(result.runnerId).toBe(runnerId);
      expect(result.runnerVersion).toBe("0.3.0");
      expect(result.protocolVersion).toBe("1.0");
      expect(result.capabilities).toBeDefined();
      expect(result.tools).toBeDefined();

      // Ensure no credentials / secrets leak
      expect(result.token).toBeUndefined();
      expect(result.env).toBeUndefined();
      expect(result.password).toBeUndefined();
      expect(result.homeDir).toBeUndefined();
    } else {
      throw new Error("Expected result in response");
    }
  });

  it("returns -32001 Duplicate request ID when concurrent request with same ID arrives", async () => {
    const router = createRouter();
    let resolveSlow: () => void;
    const slowPromise = new Promise<string>((resolve) => {
      resolveSlow = () => resolve("done");
    });

    router.register("test.slow", async () => {
      return await slowPromise;
    });

    const req1 = JSON.stringify({
      jsonrpc: "2.0",
      id: "req_duplicate_test",
      method: "test.slow",
      params: {},
    });

    // Start in-flight request 1
    const p1 = router.handle(req1);

    // Concurrently send request 2 with the same ID
    const res2 = await router.handle(req1);
    expect(res2).not.toBeNull();
    expect(res2?.id).toBe("req_duplicate_test");
    if ("error" in res2!) {
      expect(res2.error.code).toBe(-32001);
      expect(res2.error.message).toBe("Duplicate request ID");
    } else {
      throw new Error("Expected duplicate error in response");
    }

    // Complete request 1
    resolveSlow!();
    const res1 = await p1;
    expect(res1).not.toBeNull();
    if ("result" in res1!) {
      expect(res1.result).toBe("done");
    } else {
      throw new Error("Expected result in res1");
    }
  });

  it("returns -32601 Method not found for unregistered methods without closing socket", async () => {
    const router = createRouter();
    const req = JSON.stringify({
      jsonrpc: "2.0",
      id: "req_unknown_1",
      method: "unknown.test.method",
      params: {},
    });

    const res = await router.handle(req);
    expect(res).not.toBeNull();
    expect(res?.id).toBe("req_unknown_1");
    if ("error" in res!) {
      expect(res.error.code).toBe(JsonRpcStandardErrorCode.MethodNotFound);
      expect(res.error.message).toBe("Method not found");
    } else {
      throw new Error("Expected error in response");
    }
  });

  it("returns -32602 Invalid params when parameter validation fails", async () => {
    const router = createRouter();
    const req = JSON.stringify({
      jsonrpc: "2.0",
      id: "req_invalid_params_1",
      method: "system.ping",
      params: { illegal_field: "not allowed" }, // strict object rejects
    });

    const res = await router.handle(req);
    expect(res).not.toBeNull();
    expect(res?.id).toBe("req_invalid_params_1");
    if ("error" in res!) {
      expect(res.error.code).toBe(JsonRpcStandardErrorCode.InvalidParams);
      expect(res.error.message).toBe("Invalid params");
    } else {
      throw new Error("Expected error in response");
    }
  });

  it("returns -32603 Internal error when handler throws exception without leaking stack trace", async () => {
    const router = createRouter();
    router.register("test.failing", async () => {
      throw new Error("Sensitive internal error in /private/secret/file.ts at line 42");
    });

    const req = JSON.stringify({
      jsonrpc: "2.0",
      id: "req_fail_1",
      method: "test.failing",
      params: {},
    });

    const res = await router.handle(req);
    expect(res).not.toBeNull();
    expect(res?.id).toBe("req_fail_1");
    if ("error" in res!) {
      expect(res.error.code).toBe(JsonRpcStandardErrorCode.InternalError);
      expect(res.error.message).toBe("Internal error");
      // Must NOT leak stack or file paths
      expect(JSON.stringify(res.error)).not.toContain("/private/secret");
    } else {
      throw new Error("Expected error in response");
    }
  });

  it("returns -32700 Parse error when JSON is malformed without crashing", async () => {
    const router = createRouter();
    const malformed = "{ this is not json !!";

    const res = await router.handle(malformed);
    expect(res).not.toBeNull();
    expect(res?.id).toBeNull();
    if ("error" in res!) {
      expect(res.error.code).toBe(JsonRpcStandardErrorCode.ParseError);
    } else {
      throw new Error("Expected error in response");
    }
  });

  it("rejects messages exceeding MAX_RPC_MESSAGE_SIZE (1 MiB)", async () => {
    const router = createRouter();
    const hugePayload = "x".repeat(MAX_RPC_MESSAGE_SIZE + 10);

    const res = await router.handle(hugePayload);
    expect(res).not.toBeNull();
    if ("error" in res!) {
      expect(res.error.code).toBe(JsonRpcStandardErrorCode.InvalidRequest);
      expect(res.error.message).toContain("maximum allowed size");
    } else {
      throw new Error("Expected error in response");
    }
  });

  it("enforces byte-based check on multi-byte UTF-8 Unicode characters", async () => {
    const router = createRouter();
    // 400,000 Chinese characters: length is 400,000 (< 1 MiB characters),
    // but byteLength is 1,200,000 bytes (> 1 MiB limit)
    const chineseString = "中".repeat(400000);
    expect(chineseString.length).toBeLessThan(MAX_RPC_MESSAGE_SIZE);
    expect(Buffer.byteLength(chineseString, "utf8")).toBeGreaterThan(MAX_RPC_MESSAGE_SIZE);

    const res = await router.handle(chineseString);
    expect(res).not.toBeNull();
    if ("error" in res!) {
      expect(res.error.code).toBe(JsonRpcStandardErrorCode.InvalidRequest);
      expect(res.error.message).toContain("maximum allowed size");
    } else {
      throw new Error("Expected error in response");
    }
  });
});

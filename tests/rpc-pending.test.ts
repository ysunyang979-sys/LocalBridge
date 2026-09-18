import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket } from "ws";
import {
  ActiveRunnerConnection,
  type RunnerConnectionOptions,
} from "../apps/server/src/runner/registry.js";
import {
  RunnerRpcMethods,
  LocalBridgeErrorCode,
  RemoteRpcError,
  MAX_PENDING_REQUESTS,
  type TokenRow,
} from "@localbridge/protocol";

class MockSocket {
  readyState = 1; // WebSocket.OPEN
  sentMessages: string[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;

  send(payload: string, cb?: (err?: Error) => void): void {
    this.sentMessages.push(payload);
    cb?.();
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3; // WebSocket.CLOSED
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }
}

describe("Pending Request Manager (ActiveRunnerConnection)", () => {
  let mockSocket: MockSocket;
  let connection: ActiveRunnerConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSocket = new MockSocket();
    const tokenRecord: TokenRow = {
      id: "tok_123",
      name: "Test Token",
      token_type: "runner",
      token_hash: "hash",
      created_at: Date.now(),
      expires_at: null,
      revoked_at: null,
    };

    const options: RunnerConnectionOptions = {
      runnerId: "runner_test_001",
      name: "Test Runner",
      socket: mockSocket as unknown as WebSocket,
      tokenRecord,
      platform: "win32",
      arch: "x64",
      version: "0.3.0",
      protocolVersion: "1.0",
      capabilities: {
        filesystem: true,
        shell: false,
        git: true,
        build: false,
        test: false,
        docker: false,
      },
      systemInfo: {
        platform: "win32",
        arch: "x64",
        hostname: "test-host",
        nodeVersion: "v24.0.0",
        tools: {
          git: "2.40.0",
          node: "v24.0.0",
          npm: "10.0.0",
          pnpm: "10.0.0",
          python: null,
          docker: null,
        },
      },
    };

    connection = new ActiveRunnerConnection(options);
  });

  afterEach(() => {
    connection.dispose();
    vi.useRealTimers();
  });

  it("registers a request and sends JSON-RPC payload over socket", async () => {
    const promise = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 5000 });
    expect(connection.pendingRequests.size).toBe(1);
    expect(mockSocket.sentMessages.length).toBe(1);

    const sent = JSON.parse(mockSocket.sentMessages[0]!);
    expect(sent.jsonrpc).toBe("2.0");
    expect(sent.method).toBe("system.ping");
    expect(sent.id).toMatch(/^req_/);

    // Resolve by sending response
    connection.handleIncomingMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: sent.id,
        result: { pong: true, timestamp: 12345, runnerId: "runner_test_001" },
      })
    );

    const result = await promise;
    expect(result).toEqual({ pong: true, timestamp: 12345, runnerId: "runner_test_001" });
    expect(connection.pendingRequests.size).toBe(0);
    expect(connection.metrics.requestsSent).toBe(1);
    expect(connection.metrics.responsesReceived).toBe(1);
  });

  it("rejects request when remote returns JSON-RPC error", async () => {
    const promise = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 5000 });
    const sent = JSON.parse(mockSocket.sentMessages[0]!);

    connection.handleIncomingMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: sent.id,
        error: { code: -32601, message: "Method not found", data: { hint: "try system.info" } },
      })
    );

    await expect(promise).rejects.toThrowError(RemoteRpcError);
    await expect(promise).rejects.toMatchObject({
      code: -32601,
      message: "Method not found",
      data: { hint: "try system.info" },
    });
    expect(connection.pendingRequests.size).toBe(0);
    expect(connection.metrics.errors).toBe(1);
  });

  it("times out pending request and cleans up state after timeout duration", async () => {
    const promise = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 3000 });
    expect(connection.pendingRequests.size).toBe(1);

    // Advance past timeout
    vi.advanceTimersByTime(3100);

    await expect(promise).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RPC_TIMEOUT,
    });
    expect(connection.pendingRequests.size).toBe(0);
    expect(connection.metrics.timeouts).toBe(1);
  });

  it("rejects all pending requests with RUNNER_DISCONNECTED on disconnect/dispose", async () => {
    const p1 = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 5000 });
    const p2 = connection.request(RunnerRpcMethods.SystemInfo, {}, { timeoutMs: 10000 });
    expect(connection.pendingRequests.size).toBe(2);

    connection.dispose();

    await expect(p1).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RUNNER_DISCONNECTED,
    });
    await expect(p2).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RUNNER_DISCONNECTED,
    });
    expect(connection.pendingRequests.size).toBe(0);
  });

  it("safely ignores unknown response IDs without throwing or crashing", () => {
    expect(() => {
      connection.handleIncomingMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req_unknown_random_id",
          result: { pong: true },
        })
      );
    }).not.toThrow();
    expect(connection.pendingRequests.size).toBe(0);
  });

  it("enforces MAX_PENDING_REQUESTS (64) limit by throwing RUNNER_BUSY", async () => {
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < MAX_PENDING_REQUESTS; i++) {
      const p = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 5000 });
      p.catch(() => {}); // prevent unhandled rejection on dispose
      promises.push(p);
    }
    expect(connection.pendingRequests.size).toBe(MAX_PENDING_REQUESTS);

    // 65th request must throw immediately
    await expect(
      connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 5000 })
    ).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RUNNER_BUSY,
    });

    // Cleanup
    connection.dispose();
  });

  it("supports cancellation via AbortSignal", async () => {
    const controller = new AbortController();
    const promise = connection.request(
      RunnerRpcMethods.SystemPing,
      {},
      { timeoutMs: 5000, signal: controller.signal }
    );
    expect(connection.pendingRequests.size).toBe(1);

    controller.abort(new Error("Request aborted by caller"));

    await expect(promise).rejects.toThrow("Request aborted by caller");
    expect(connection.pendingRequests.size).toBe(0);
  });

  it("socket send failure cleans pending state (async callback error)", async () => {
    // Force mockSocket.send to trigger callback with an error
    mockSocket.send = (_payload: string, cb?: (err?: Error) => void) => {
      cb?.(new Error("EPIPE: broken pipe"));
    };

    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller.signal, "removeEventListener");

    const promise = connection.request(
      RunnerRpcMethods.SystemPing,
      {},
      { timeoutMs: 5000, signal: controller.signal }
    );

    await expect(promise).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RPC_REMOTE_ERROR,
    });

    expect(connection.pendingRequests.size).toBe(0);
    expect(connection.metrics.errors).toBe(1);
    expect(abortSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("socket send failure cleans pending state (sync throw)", async () => {
    // Force mockSocket.send to throw synchronously
    mockSocket.send = () => {
      throw new Error("Socket synchronous write error");
    };

    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller.signal, "removeEventListener");

    const promise = connection.request(
      RunnerRpcMethods.SystemPing,
      {},
      { timeoutMs: 5000, signal: controller.signal }
    );

    await expect(promise).rejects.toMatchObject({
      code: LocalBridgeErrorCode.RPC_REMOTE_ERROR,
    });

    expect(connection.pendingRequests.size).toBe(0);
    expect(connection.metrics.errors).toBe(1);
    expect(abortSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("removes AbortSignal listener across all completion paths", async () => {
    // 1. Success path
    const c1 = new AbortController();
    const spy1 = vi.spyOn(c1.signal, "removeEventListener");
    const p1 = connection.request(RunnerRpcMethods.SystemPing, {}, { signal: c1.signal });
    const id1 = JSON.parse(mockSocket.sentMessages[mockSocket.sentMessages.length - 1]!).id;
    connection.handleIncomingMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: id1,
        result: { pong: true, timestamp: Date.now(), runnerId: "runner_test_001" },
      })
    );
    await p1;
    expect(spy1).toHaveBeenCalledWith("abort", expect.any(Function));

    // 2. Remote error path
    const c2 = new AbortController();
    const spy2 = vi.spyOn(c2.signal, "removeEventListener");
    const p2 = connection.request(RunnerRpcMethods.SystemPing, {}, { signal: c2.signal });
    const id2 = JSON.parse(mockSocket.sentMessages[mockSocket.sentMessages.length - 1]!).id;
    connection.handleIncomingMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: id2,
        error: { code: -32601, message: "Method not found" },
      })
    );
    await expect(p2).rejects.toThrowError(RemoteRpcError);
    expect(spy2).toHaveBeenCalledWith("abort", expect.any(Function));

    // 3. Timeout path
    const c3 = new AbortController();
    const spy3 = vi.spyOn(c3.signal, "removeEventListener");
    const p3 = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 2000, signal: c3.signal });
    vi.advanceTimersByTime(2100);
    await expect(p3).rejects.toMatchObject({ code: LocalBridgeErrorCode.RPC_TIMEOUT });
    expect(spy3).toHaveBeenCalledWith("abort", expect.any(Function));

    // 4. Disconnect path
    const c4 = new AbortController();
    const spy4 = vi.spyOn(c4.signal, "removeEventListener");
    const p4 = connection.request(RunnerRpcMethods.SystemPing, {}, { timeoutMs: 5000, signal: c4.signal });
    connection.dispose();
    await expect(p4).rejects.toMatchObject({ code: LocalBridgeErrorCode.RUNNER_DISCONNECTED });
    expect(spy4).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

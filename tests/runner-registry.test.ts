import { describe, it, expect, vi } from "vitest";
import { RunnerRegistry, type RunnerConnection } from "../apps/server/src/runner/registry.js";
import type { WebSocket } from "ws";

function createMockSocket(): WebSocket {
  return {
    close: vi.fn(),
    terminate: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
  } as unknown as WebSocket;
}

function createMockConnection(runnerId: string, name: string): { conn: RunnerConnection; socket: WebSocket } {
  const socket = createMockSocket();
  const conn: RunnerConnection = {
    runnerId,
    name,
    socket,
    tokenRecord: {
      id: "tok_123",
      type: "runner",
      token_hash: "hash",
      name: "Token",
      scopes: "[]",
      created_at: Date.now(),
      last_used_at: null,
      expires_at: null,
      revoked_at: null,
    },
    platform: "win32",
    arch: "x64",
    version: "0.2.0",
    protocolVersion: "1.0",
    capabilities: {
      filesystem: true,
      shell: true,
      git: true,
      build: true,
      test: true,
      docker: false,
    },
    systemInfo: {
      platform: "win32",
      arch: "x64",
      hostname: "host",
      nodeVersion: "v24.0.0",
      tools: {},
    },
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
    missedPings: 0,
    pendingRequests: new Map(),
    metrics: {
      requestsSent: 0,
      responsesReceived: 0,
      timeouts: 0,
      errors: 0,
    },
    request: vi.fn(),
    handleIncomingMessage: vi.fn(),
    dispose: vi.fn(),
  };

  return { conn, socket };
}

describe("RunnerRegistry", () => {
  it("registers runner and increments count", () => {
    const registry = new RunnerRegistry();
    expect(registry.count()).toBe(0);

    const { conn } = createMockConnection("runner_1", "PC 1");
    registry.register(conn);

    expect(registry.count()).toBe(1);
    expect(registry.get("runner_1")).toBe(conn);

    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("runner_1");
    expect(list[0]?.name).toBe("PC 1");
    expect(list[0]?.status).toBe("online");
  });

  it("unregisters runner and decrements count", () => {
    const registry = new RunnerRegistry();
    const { conn, socket } = createMockConnection("runner_1", "PC 1");
    registry.register(conn);

    expect(registry.count()).toBe(1);
    const unregistered = registry.unregister("runner_1", socket);
    expect(unregistered).toBe(true);
    expect(registry.count()).toBe(0);
    expect(registry.get("runner_1")).toBeUndefined();
  });

  it("does not unregister if a different socket attempts unregistration", () => {
    const registry = new RunnerRegistry();
    const { conn } = createMockConnection("runner_1", "PC 1");
    registry.register(conn);

    const differentSocket = createMockSocket();
    const unregistered = registry.unregister("runner_1", differentSocket);
    expect(unregistered).toBe(false);
    expect(registry.count()).toBe(1);
  });

  it("replaces existing connection and closes old socket on duplicate runner ID", () => {
    const registry = new RunnerRegistry();
    const { conn: firstConn, socket: firstSocket } = createMockConnection("runner_1", "Old Session");
    const { conn: secondConn, socket: secondSocket } = createMockConnection("runner_1", "New Session");

    registry.register(firstConn);
    expect(registry.count()).toBe(1);

    registry.register(secondConn);
    expect(registry.count()).toBe(1);
    expect(registry.get("runner_1")).toBe(secondConn);

    // Old socket closed with code 4000
    expect(firstSocket.close).toHaveBeenCalledWith(4000, "runner_session_replaced");
    expect(secondSocket.close).not.toHaveBeenCalled();
  });

  it("closes all active connections upon closeAll", () => {
    const registry = new RunnerRegistry();
    const { conn: conn1, socket: socket1 } = createMockConnection("runner_1", "PC 1");
    const { conn: conn2, socket: socket2 } = createMockConnection("runner_2", "PC 2");

    registry.register(conn1);
    registry.register(conn2);
    expect(registry.count()).toBe(2);

    registry.closeAll();
    expect(registry.count()).toBe(0);
    expect(socket1.close).toHaveBeenCalledWith(1001, "server_shutdown");
    expect(socket2.close).toHaveBeenCalledWith(1001, "server_shutdown");
  });
});

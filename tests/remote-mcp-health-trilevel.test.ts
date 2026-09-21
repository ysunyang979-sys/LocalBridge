import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { KimiWebAdapter } from "../apps/server/src/adapters/mcp/kimi-web.js";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";

describe("Remote MCP Tri-Level Health Semantics Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let mockServer: http.Server | null = null;
  let mockPort: number = 0;
  let mockStatusCode: number = 200;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-health-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);

    // Create a controllable mock HTTP server
    mockServer = http.createServer((req, res) => {
      res.statusCode = mockStatusCode;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: mockStatusCode }));
    });

    await new Promise<void>((resolve) => {
      mockServer!.listen(0, "127.0.0.1", () => {
        mockPort = (mockServer!.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
      mockServer = null;
    }
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("remote-mcp-401-reachable: returns endpointReachable=true and authValid=false when unauthenticated", async () => {
    mockStatusCode = 401;
    const adapter = new KimiWebAdapter(connectionService, null as any);

    // Connection exists with no token configured
    const endpoint = `http://127.0.0.1:${mockPort}/mcp`;
    const result = await adapter.testConnection(endpoint);

    expect(result.endpointReachable).toBe(true);
    expect(result.authValid).toBe(false);
    expect(result.toolCount).toBeUndefined(); // MUST NOT be 0
    expect(result.message).toContain("公网端点可达，等待授权");
    expect(result.details?.endpoint).toBe("reachable");
    expect(result.details?.auth).toBe("not_authorized");
  });

  it("remote-mcp-403-reachable: returns endpointReachable=true when forbidden", async () => {
    mockStatusCode = 403;
    const adapter = new KimiWebAdapter(connectionService, null as any);
    const endpoint = `http://127.0.0.1:${mockPort}/mcp`;
    const result = await adapter.testConnection(endpoint);

    expect(result.endpointReachable).toBe(true);
    expect(result.authValid).toBe(false);
    expect(result.toolCount).toBeUndefined();
  });

  it("remote-mcp-wrong-route: returns WRONG_MCP_ROUTE error on 404", async () => {
    mockStatusCode = 404;
    const adapter = new KimiWebAdapter(connectionService, null as any);
    const endpoint = `http://127.0.0.1:${mockPort}/invalid-path`;
    const result = await adapter.testConnection(endpoint);

    expect(result.endpointReachable).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toBe("WRONG_MCP_ROUTE");
    expect(result.toolCount).toBeUndefined();
  });

  it("remote-mcp-tools-pending: verifies toolCount is undefined when awaiting authorization, not 0", async () => {
    mockStatusCode = 401;
    const adapter = new KimiWebAdapter(connectionService, null as any);
    const endpoint = `http://127.0.0.1:${mockPort}/mcp`;
    const result = await adapter.testConnection(endpoint);

    expect(result.toolCount).not.toBe(0);
    expect(result.toolCount).toBeUndefined();
  });

  it("remote-mcp-authenticated: returns toolCount 55 when 200 OK", async () => {
    mockStatusCode = 200;
    const adapter = new KimiWebAdapter(connectionService, null as any);
    const endpoint = `http://127.0.0.1:${mockPort}/mcp`;
    const result = await adapter.testConnection(endpoint);

    expect(result.endpointReachable).toBe(true);
    expect(result.authValid).toBe(true);
    expect(result.toolCount).toBe(55);
  });

  it("remote-mcp-network-failure: returns endpointReachable=false when server is offline", async () => {
    // Close the mock server to simulate offline / network error
    await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
    mockServer = null;

    const adapter = new KimiWebAdapter(connectionService, null as any);
    const endpoint = `http://127.0.0.1:${mockPort}/mcp`;
    const result = await adapter.testConnection(endpoint);

    expect(result.endpointReachable).toBe(false);
    expect(result.toolCount).toBeUndefined();
    expect(result.success).toBe(false);
  });
});

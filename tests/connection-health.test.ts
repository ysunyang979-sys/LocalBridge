import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { AdapterRegistry } from "../apps/server/src/adapters/index.js";
import { McpContext } from "../apps/server/src/mcp/context.js";
import { ServerProjectService } from "../apps/server/src/runner/project-service.js";
import { RunnerRegistry } from "../apps/server/src/runner/registry.js";
import { RunnerRpcService } from "../apps/server/src/runner/rpc-service.js";
import { createLogger } from "@localbridge/shared";

describe("ConnectionHealth & Status Transitions Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let adapterRegistry: AdapterRegistry;
  let mcpContext: McpContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-health-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);

    const logger = createLogger({ level: "silent" });
    const runnerRegistry = new RunnerRegistry(logger);
    const rpcService = new RunnerRpcService(runnerRegistry);
    const projectService = new ServerProjectService(dbConn.db, runnerRegistry);

    mcpContext = new McpContext({
      projectService,
      runnerRegistry,
      rpcService,
      db: dbConn.db,
      logger,
    });

    adapterRegistry = new AdapterRegistry(connectionService, mcpContext);
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("calculates initial health for not_configured adapter", async () => {
    const adapter = adapterRegistry.getAdapter("conn_kimi");
    expect(adapter).toBeDefined();

    const health = await adapter!.getHealth();
    expect(health.id).toBe("conn_kimi");
    expect(health.status).toBe("not_configured");
    expect(health.authValid).toBe(false);
    expect(health.toolCount).toBeGreaterThan(0);
  });

  it("transitions health to configured when token is generated", async () => {
    connectionService.createOrRotateToken("conn_kimi");
    const adapter = adapterRegistry.getAdapter("conn_kimi");
    const health = await adapter!.getHealth();

    expect(health.status).toBe("configured");
    expect(health.authValid).toBe(true);
  });

  it("records live interaction updates lastSeenAt and connected status", async () => {
    connectionService.createOrRotateToken("conn_claude");
    connectionService.recordInteraction("conn_claude");

    const adapter = adapterRegistry.getAdapter("conn_claude");
    const health = await adapter!.getHealth();

    expect(health.status).toBe("connected");
    expect(health.lastSeenAt).toBeDefined();
    expect(health.lastSeenAt).toBeGreaterThan(0);
    expect(health.latencyMs).toBeGreaterThan(0);
  });

  it("records error status and diagnostic message", async () => {
    connectionService.updateStatus("conn_claude", "error", "Local MCP port conflict detected");
    const conn = connectionService.getConnection("conn_claude");

    expect(conn?.status).toBe("error");
    expect(conn?.lastError).toBe("Local MCP port conflict detected");

    const adapter = adapterRegistry.getAdapter("conn_claude");
    const health = await adapter!.getHealth();
    expect(health.status).toBe("error");
    expect(health.lastError).toBe("Local MCP port conflict detected");
  });
});

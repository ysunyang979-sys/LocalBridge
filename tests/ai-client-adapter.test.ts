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

describe("AIClientAdapter & AdapterRegistry Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let adapterRegistry: AdapterRegistry;
  let mcpContext: McpContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-adapter-test-"));
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

  it("registers built-in adapters on initialization", () => {
    const adapters = adapterRegistry.getAll();
    expect(adapters.length).toBeGreaterThanOrEqual(5);

    const ids = adapters.map((a) => a.id);
    expect(ids).toContain("conn_chatgpt");
    expect(ids).toContain("conn_kimi");
    expect(ids).toContain("conn_claude");
    expect(ids).toContain("conn_gemini");
    expect(ids).toContain("conn_deepseek");
  });

  it("retrieves adapters by id and clientType", () => {
    const chatgpt = adapterRegistry.getAdapter("conn_chatgpt");
    expect(chatgpt).toBeDefined();
    expect(chatgpt?.clientType).toBe("chatgpt");
    expect(chatgpt?.category).toBe("native-mcp");

    const kimi = adapterRegistry.getByClientType("kimi");
    expect(kimi).toBeDefined();
    expect(kimi?.name).toContain("Kimi");

    const deepseek = adapterRegistry.getByClientType("deepseek");
    expect(deepseek).toBeDefined();
    expect(deepseek?.category).toBe("tool-adapter");
  });

  it("generates valid MCP config snippets for native adapters", () => {
    const token = "lb_test_token_12345";
    const kimi = adapterRegistry.getByClientType("kimi");
    const snippet = kimi?.generateConfigSnippet(token);

    expect(snippet).toBeDefined();
    expect(snippet?.mcpServers?.nexus).toBeDefined();
    expect(snippet?.mcpServers?.nexus?.url).toBe("http://127.0.0.1:18080/mcp");
    expect(snippet?.mcpServers?.nexus?.headers?.Authorization).toBe(`Bearer ${token}`);
  });

  it("tests connection health through adapter", async () => {
    const testRes = await adapterRegistry.testConnection("conn_kimi");
    expect(testRes).toBeDefined();
    expect(testRes.success).toBe(true);
    expect(testRes.stage).toBe("tools");
    expect(testRes.toolCount).toBeGreaterThan(0);
    expect(testRes.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("registers and removes custom adapters dynamically", () => {
    const customConfig = connectionService.createOrUpdateConnection({
      id: "conn_custom_1",
      clientType: "custom-mcp",
      name: "My Custom MCP Client",
      category: "native-mcp",
      transport: "http",
      endpoint: "http://127.0.0.1:18080/mcp",
    });

    const registered = adapterRegistry.registerCustom(customConfig);
    expect(registered).toBeDefined();
    expect(adapterRegistry.getAdapter("conn_custom_1")).toBeDefined();

    connectionService.deleteConnection("conn_custom_1");
    const removed = adapterRegistry.removeCustom("conn_custom_1");
    expect(removed).toBe(true);
    expect(adapterRegistry.getAdapter("conn_custom_1")).toBeNull();
  });
});

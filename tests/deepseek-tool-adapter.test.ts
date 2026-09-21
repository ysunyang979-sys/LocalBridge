import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { DeepSeekToolAdapter } from "../apps/server/src/adapters/tools/index.js";

describe("DeepSeek Tool Adapter Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let mockMcpContext: any;
  let auditLogs: any[] = [];
  let isPausedState = false;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-deepseek-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);

    auditLogs = [];
    isPausedState = false;
    mockMcpContext = {
      isPaused: () => isPausedState,
      logAudit: (event: string, meta: any) => {
        auditLogs.push({ event, meta });
      },
    };
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("identifies as tool-adapter and NOT native-mcp", () => {
    const adapter = new DeepSeekToolAdapter(connectionService, mockMcpContext);
    expect(adapter.category).toBe("tool-adapter");
    expect(adapter.clientType).toBe("deepseek");
    expect(adapter.name).toBe("DeepSeek");
  });

  it("translates internal tools to OpenAI/DeepSeek function calling schema format", () => {
    const adapter = new DeepSeekToolAdapter(connectionService, mockMcpContext);
    const tools = adapter.getToolDefinitions();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    const firstTool = tools[0];
    expect(firstTool.type).toBe("function");
    expect(firstTool.function).toBeDefined();
    expect(typeof firstTool.function.name).toBe("string");
    expect(firstTool.function.parameters.type).toBe("object");
  });

  it("rejects test connection when API key is missing", async () => {
    const adapter = new DeepSeekToolAdapter(connectionService, mockMcpContext);
    const res = await adapter.testConnection();

    expect(res.success).toBe(false);
    expect(res.stage).toBe("auth");
    expect(res.error).toBe("MISSING_API_KEY");
  });

  it("enforces Nexus security pause check during function call execution", async () => {
    const adapter = new DeepSeekToolAdapter(connectionService, mockMcpContext);
    isPausedState = true;

    const result = await adapter.executeToolCall({
      name: "localbridge_file_read",
      arguments: { projectId: "proj_1", path: "README.md" },
      clientId: "conn_deepseek",
      clientType: "deepseek",
      clientName: "DeepSeek",
      projectId: "proj_1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("paused by local operator");
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].event).toBe("mcp_tool_started");
    expect(auditLogs[0].meta.clientId).toBe("conn_deepseek");
  });

  it("safely executes function call and records audit metadata when unpaused", async () => {
    const adapter = new DeepSeekToolAdapter(connectionService, mockMcpContext);
    isPausedState = false;

    const result = await adapter.executeToolCall({
      name: "localbridge_file_read",
      arguments: { projectId: "proj_1", path: "package.json" },
      clientId: "conn_deepseek",
      clientType: "deepseek",
      clientName: "DeepSeek",
      projectId: "proj_1",
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result.client).toBe("DeepSeek");
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].meta.actorDisplayName).toBe("DeepSeek");
  });
});

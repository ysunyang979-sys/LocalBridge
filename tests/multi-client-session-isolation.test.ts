import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { McpContext } from "../apps/server/src/mcp/context.js";

describe("Multi-Client Session & Audit Isolation Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let mcpContext: McpContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-multiclient-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);

    mcpContext = new McpContext({
      projectService: { getProject: () => null } as any,
      runnerRegistry: { get: () => null } as any,
      rpcService: {} as any,
      db: dbConn.db,
      decisionProvider: {
        getHealth: async () => ({ status: "ok" }),
      } as any,
    });
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("isolates tokens across multiple concurrent AI clients", () => {
    const kimiToken = connectionService.createOrRotateToken("conn_kimi", ["read"]);
    const claudeToken = connectionService.createOrRotateToken("conn_claude", ["read", "write"]);
    const geminiToken = connectionService.createOrRotateToken("conn_gemini", ["read", "write", "execute"]);

    const kimiConn = connectionService.getConnection("conn_kimi");
    const claudeConn = connectionService.getConnection("conn_claude");
    const geminiConn = connectionService.getConnection("conn_gemini");

    expect(kimiConn?.tokenId).toBe(kimiToken.tokenId);
    expect(claudeConn?.tokenId).toBe(claudeToken.tokenId);
    expect(geminiConn?.tokenId).toBe(geminiToken.tokenId);

    expect(kimiConn?.tokenId).not.toBe(claudeConn?.tokenId);
    expect(claudeConn?.tokenId).not.toBe(geminiConn?.tokenId);
  });

  it("maintains isolated audit trails for concurrent client operations", async () => {
    // Simulate concurrent requests from Kimi, Claude, and DeepSeek
    const tasks = [
      () =>
        mcpContext.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_read",
          projectId: "proj_alpha",
          clientId: "conn_kimi",
          clientType: "kimi",
          clientName: "Kimi Code",
          actorDisplayName: "Kimi Code",
        }),
      () =>
        mcpContext.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_write",
          projectId: "proj_beta",
          clientId: "conn_claude",
          clientType: "claude",
          clientName: "Claude Desktop",
          actorDisplayName: "Claude Desktop",
        }),
      () =>
        mcpContext.logAudit("mcp_tool_started", {
          toolName: "localbridge_command_execute",
          projectId: "proj_gamma",
          clientId: "conn_deepseek",
          clientType: "deepseek",
          clientName: "DeepSeek",
          actorDisplayName: "DeepSeek",
        }),
    ];

    // Execute concurrently
    await Promise.all(tasks.map((fn) => Promise.resolve(fn())));

    const events = mcpContext.getAuditEvents(10);
    expect(events.length).toBe(3);

    const kimiEvent = events.find((e) => e.clientId === "conn_kimi");
    const claudeEvent = events.find((e) => e.clientId === "conn_claude");
    const deepseekEvent = events.find((e) => e.clientId === "conn_deepseek");

    expect(kimiEvent).toBeDefined();
    expect(kimiEvent?.toolName).toBe("localbridge_file_read");
    expect(kimiEvent?.clientType).toBe("kimi");
    expect(kimiEvent?.clientName).toBe("Kimi Code");

    expect(claudeEvent).toBeDefined();
    expect(claudeEvent?.toolName).toBe("localbridge_file_write");
    expect(claudeEvent?.clientType).toBe("claude");
    expect(claudeEvent?.clientName).toBe("Claude Desktop");

    expect(deepseekEvent).toBeDefined();
    expect(deepseekEvent?.toolName).toBe("localbridge_command_execute");
    expect(deepseekEvent?.clientType).toBe("deepseek");
    expect(deepseekEvent?.clientName).toBe("DeepSeek");
  });
});

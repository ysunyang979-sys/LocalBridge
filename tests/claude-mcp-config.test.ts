import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { ClaudeAdapter } from "../apps/server/src/adapters/mcp/index.js";

describe("Claude Code & Desktop MCP Configuration Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-claude-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("identifies Claude as native-mcp", () => {
    const conn = connectionService.getConnection("conn_claude");
    expect(conn).toBeDefined();
    expect(conn?.clientType).toBe("claude");
    expect(conn?.category).toBe("native-mcp");
    expect(conn?.transport).toBe("http");
  });

  it("generates standard Claude Desktop / Code configuration snippet", () => {
    const adapter = new ClaudeAdapter(connectionService, null);
    const snippet = adapter.generateConfigSnippet("claude-test-token-456");

    expect(snippet).toHaveProperty("mcpServers");
    expect(snippet.mcpServers).toHaveProperty("nexus");
    expect(snippet.mcpServers.nexus.url).toBe("http://127.0.0.1:18080/mcp");
    expect(snippet.mcpServers.nexus.headers.Authorization).toBe("Bearer claude-test-token-456");
  });

  it("detects Claude config file path candidate", () => {
    const detected = connectionService.detectClientConfigPath("claude");
    expect(detected.path).toBeDefined();
    expect(typeof detected.path).toBe("string");
    expect(detected.path).toMatch(/(claude_desktop_config\.json|\.claude\.json)/);
  });
});

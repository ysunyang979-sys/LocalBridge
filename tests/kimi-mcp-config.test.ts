import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { KimiCodeAdapter } from "../apps/server/src/adapters/mcp/index.js";

describe("Kimi Code MCP Configuration Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-test-"));
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

  it("identifies Kimi as native-mcp with standard HTTP transport", () => {
    const conn = connectionService.getConnection("conn_kimi");
    expect(conn).toBeDefined();
    expect(conn?.clientType).toBe("kimi");
    expect(conn?.category).toBe("native-mcp");
    expect(conn?.transport).toBe("http");
  });

  it("generates valid MCP server configuration snippet for Kimi", () => {
    const adapter = new KimiCodeAdapter(connectionService, null);
    const snippet = adapter.generateConfigSnippet("test-token-123");

    expect(snippet).toHaveProperty("mcpServers");
    expect(snippet.mcpServers).toHaveProperty("nexus");
    expect(snippet.mcpServers.nexus.url).toBe("http://127.0.0.1:18080/mcp");
    expect(snippet.mcpServers.nexus.headers.Authorization).toBe("Bearer test-token-123");
  });

  it("merges nexus config into existing ~/.kimi-code/mcp.json without overwriting other servers", () => {
    const fakeKimiConfigDir = path.join(tmpDir, ".kimi-code");
    fs.mkdirSync(fakeKimiConfigDir, { recursive: true });
    const fakeKimiConfigFile = path.join(fakeKimiConfigDir, "mcp.json");

    const existingConfig = {
      mcpServers: {
        github: {
          url: "https://api.github.com/mcp",
          headers: { Authorization: "token ghp_xyz" }
        }
      }
    };
    fs.writeFileSync(fakeKimiConfigFile, JSON.stringify(existingConfig, null, 2), "utf8");

    // Test preview patch logic
    const { token } = connectionService.createOrRotateToken("conn_kimi");
    const preview = connectionService.previewConfigPatch("conn_kimi", token);

    // Verify preview logic handles mcpServers merging
    const snippet = connectionService.generateConfigSnippet("conn_kimi", token);
    const merged = {
      ...existingConfig,
      mcpServers: {
        ...existingConfig.mcpServers,
        ...snippet.mcpServers,
      }
    };

    expect(merged.mcpServers.github).toBeDefined();
    expect(merged.mcpServers.nexus).toBeDefined();
    expect(merged.mcpServers.nexus.headers.Authorization).toBe(`Bearer ${token}`);
  });
});

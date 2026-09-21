import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { GeminiCliAdapter } from "../apps/server/src/adapters/mcp/index.js";

describe("Gemini CLI MCP Configuration Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-gemini-test-"));
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

  it("identifies Gemini CLI as native-mcp with streamable-http transport", () => {
    const conn = connectionService.getConnection("conn_gemini");
    expect(conn).toBeDefined();
    expect(conn?.clientType).toBe("gemini");
    expect(conn?.category).toBe("native-mcp");
    expect(conn?.transport).toBe("streamable-http");
  });

  it("generates streamable-http MCP snippet for Gemini CLI", () => {
    const adapter = new GeminiCliAdapter(connectionService, null);
    const snippet = adapter.generateConfigSnippet("gemini-test-token-789");

    expect(snippet).toHaveProperty("mcpServers");
    expect(snippet.mcpServers).toHaveProperty("nexus");
    expect(snippet.mcpServers.nexus.url).toBe("http://127.0.0.1:18080/mcp");
    expect(snippet.mcpServers.nexus.headers.Authorization).toBe("Bearer gemini-test-token-789");
  });

  it("detects Gemini settings path candidate", () => {
    const detected = connectionService.detectClientConfigPath("gemini");
    expect(detected.path).toBeDefined();
    expect(detected.path).toContain(path.join(".gemini", "settings.json"));
  });
});

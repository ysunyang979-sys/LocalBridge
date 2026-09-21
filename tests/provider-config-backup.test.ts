import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";

describe("Provider Config Atomic Backup Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-backup-test-"));
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

  it("creates timestamped backup when patching an existing config file", () => {
    const configDir = path.join(tmpDir, "agent-config");
    fs.mkdirSync(configDir, { recursive: true });
    const targetConfigFile = path.join(configDir, "client_mcp.json");

    const originalContent = JSON.stringify({
      mcpServers: {
        existing_tool: {
          url: "http://localhost:9000",
        },
      },
    }, null, 2);
    fs.writeFileSync(targetConfigFile, originalContent, "utf8");

    connectionService.createOrUpdateConnection({
      id: "conn_test_client",
      clientType: "custom-mcp",
      name: "Test Client",
      detectedConfigPath: targetConfigFile,
    });

    const { token } = connectionService.createOrRotateToken("conn_test_client");
    const result = connectionService.applyConfigPatch("conn_test_client", token);

    expect(result.success).toBe(true);
    expect(result.backupFilePath).toBeDefined();
    expect(fs.existsSync(result.backupFilePath!)).toBe(true);
    expect(result.backupFilePath).toContain(".nexus.bak.");

    // Backup content must match original untouched content
    const backupData = fs.readFileSync(result.backupFilePath!, "utf8");
    expect(backupData).toBe(originalContent);

    // Target file must be updated with nexus server
    const updated = JSON.parse(fs.readFileSync(targetConfigFile, "utf8"));
    expect(updated.mcpServers.existing_tool).toBeDefined();
    expect(updated.mcpServers.nexus).toBeDefined();
    expect(updated.mcpServers.nexus.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it("creates new config file cleanly without backup when file does not previously exist", () => {
    const targetConfigFile = path.join(tmpDir, "new-agent", "mcp.json");

    connectionService.createOrUpdateConnection({
      id: "conn_fresh_client",
      clientType: "custom-mcp",
      name: "Fresh Client",
      detectedConfigPath: targetConfigFile,
    });

    const { token } = connectionService.createOrRotateToken("conn_fresh_client");
    const result = connectionService.applyConfigPatch("conn_fresh_client", token);

    expect(result.success).toBe(true);
    expect(result.backupFilePath).toBeUndefined();
    expect(fs.existsSync(targetConfigFile)).toBe(true);

    const created = JSON.parse(fs.readFileSync(targetConfigFile, "utf8"));
    expect(created.mcpServers.nexus).toBeDefined();
    expect(created.mcpServers.nexus.headers.Authorization).toBe(`Bearer ${token}`);
  });
});

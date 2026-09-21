import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";

describe("Provider Config Rollback Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-rollback-test-"));
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

  it("successfully rolls back configuration when a valid backup exists", () => {
    const targetConfigFile = path.join(tmpDir, "mcp.json");
    const initialConfig = JSON.stringify({ version: "1.0", originalSetting: true }, null, 2);
    fs.writeFileSync(targetConfigFile, initialConfig, "utf8");

    connectionService.createOrUpdateConnection({
      id: "conn_rollback_client",
      clientType: "custom-mcp",
      name: "Rollback Client",
      detectedConfigPath: targetConfigFile,
    });

    const { token } = connectionService.createOrRotateToken("conn_rollback_client");
    const applyResult = connectionService.applyConfigPatch("conn_rollback_client", token);

    expect(applyResult.success).toBe(true);
    expect(applyResult.backupFilePath).toBeDefined();

    // Verify file was indeed changed
    const patchedContent = fs.readFileSync(targetConfigFile, "utf8");
    expect(patchedContent).not.toBe(initialConfig);

    // Rollback
    const rollbackSuccess = connectionService.rollbackConfigPatch(targetConfigFile, applyResult.backupFilePath!);
    expect(rollbackSuccess).toBe(true);

    // Verify restored to exact initial content
    const restoredContent = fs.readFileSync(targetConfigFile, "utf8");
    expect(restoredContent).toBe(initialConfig);
  });

  it("fails gracefully and returns false when backup file does not exist", () => {
    const targetConfigFile = path.join(tmpDir, "mcp.json");
    fs.writeFileSync(targetConfigFile, "existing", "utf8");

    const nonExistentBackup = path.join(tmpDir, "mcp.json.nexus.bak.nonexistent");
    const res = connectionService.rollbackConfigPatch(targetConfigFile, nonExistentBackup);

    expect(res).toBe(false);
    expect(fs.readFileSync(targetConfigFile, "utf8")).toBe("existing");
  });
});

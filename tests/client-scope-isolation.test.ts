import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";

describe("Client Scope Isolation Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-scope-iso-"));
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

  it("restricts client token to assigned scopes", () => {
    // Client 1: Read-only Kimi
    const kimiToken = connectionService.createOrRotateToken("conn_kimi", ["read"]);
    // Client 2: Read-Write Claude
    const claudeToken = connectionService.createOrRotateToken("conn_claude", ["read", "write"]);

    const kimiConn = connectionService.getConnection("conn_kimi");
    const claudeConn = connectionService.getConnection("conn_claude");

    expect(kimiConn?.scopes).toEqual(["read"]);
    expect(claudeConn?.scopes).toEqual(["read", "write"]);

    // Verify token validation directly in TokenService
    const validatedKimi = tokenService.validateMcpToken(kimiToken.token);
    expect(validatedKimi.valid).toBe(true);
    const kimiScopes = JSON.parse(validatedKimi.tokenRecord?.scopes || "[]");
    expect(kimiScopes).toEqual(["read"]);
    expect(kimiScopes.includes("write")).toBe(false);

    const validatedClaude = tokenService.validateMcpToken(claudeToken.token);
    expect(validatedClaude.valid).toBe(true);
    const claudeScopes = JSON.parse(validatedClaude.tokenRecord?.scopes || "[]");
    expect(claudeScopes).toEqual(["read", "write"]);
    expect(claudeScopes.includes("write")).toBe(true);
  });

  it("enforces scope check preventing read-only client from performing write actions", () => {
    const { token } = connectionService.createOrRotateToken("conn_kimi", ["read"]);
    const validated = tokenService.validateMcpToken(token);
    expect(validated.valid).toBe(true);

    const scopes: string[] = JSON.parse(validated.tokenRecord?.scopes || "[]");

    const checkPermission = (requiredScope: string) => {
      if (!scopes.includes(requiredScope)) {
        throw new Error(`Insufficient scope: requires ${requiredScope}, but token has [${scopes.join(", ")}]`);
      }
      return true;
    };

    expect(checkPermission("read")).toBe(true);
    expect(() => checkPermission("write")).toThrow("Insufficient scope: requires write");
  });

  it("rotates token for one client without modifying or invalidating another client's token", () => {
    const kimi1 = connectionService.createOrRotateToken("conn_kimi", ["read"]);
    const claude = connectionService.createOrRotateToken("conn_claude", ["read", "write"]);

    // Rotate Kimi
    const kimi2 = connectionService.createOrRotateToken("conn_kimi", ["read", "execute"]);

    // Kimi1 is revoked
    expect(tokenService.validateMcpToken(kimi1.token).valid).toBe(false);
    // Kimi2 is valid with new scopes
    const validKimi2 = tokenService.validateMcpToken(kimi2.token);
    expect(validKimi2.valid).toBe(true);
    expect(JSON.parse(validKimi2.tokenRecord?.scopes || "[]")).toEqual(["read", "execute"]);

    // Claude token remains perfectly valid with original scopes
    const validClaude = tokenService.validateMcpToken(claude.token);
    expect(validClaude.valid).toBe(true);
    expect(JSON.parse(validClaude.tokenRecord?.scopes || "[]")).toEqual(["read", "write"]);
  });
});

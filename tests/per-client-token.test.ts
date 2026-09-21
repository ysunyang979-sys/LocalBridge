import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";

describe("Per-Client Token Architecture & Isolation Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-per-client-test-"));
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

  it("kimi-dedicated-token: creates token with lb_kimi_ prefix and scoped permissions", () => {
    const result = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);

    expect(result.token).toMatch(/^lb_kimi_[0-9a-f]{64}$/);
    expect(result.tokenId).toBeTruthy();

    const conn = connectionService.getConnection("conn_kimi_web");
    expect(conn).not.toBeNull();
    expect(conn?.tokenId).toBe(result.tokenId);
    expect(conn?.scopes).toEqual(["read", "write"]);
    // Execute scope must not be granted
    expect(conn?.scopes).not.toContain("execute");
  });

  it("per-client-token & isolation: ChatGPT and Kimi have distinct tokens (A != B)", () => {
    // Generate token for ChatGPT
    const chatgptToken = connectionService.createOrRotateToken("conn_chatgpt", ["read", "write", "execute"]);
    // Generate token for Kimi Web
    const kimiToken = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);

    expect(chatgptToken.token).not.toBe(kimiToken.token);
    expect(chatgptToken.tokenId).not.toBe(kimiToken.tokenId);
    expect(chatgptToken.token.startsWith("lb_kimi_")).toBe(false);
    expect(kimiToken.token.startsWith("lb_kimi_")).toBe(true);

    // Verify both are valid tokens in TokenService
    const validatedChatgpt = tokenService.validateMcpToken(chatgptToken.token);
    const validatedKimi = tokenService.validateMcpToken(kimiToken.token);

    expect(validatedChatgpt.valid).toBe(true);
    expect(validatedKimi.valid).toBe(true);
    const chatgptScopes = JSON.parse(validatedChatgpt.tokenRecord!.scopes);
    const kimiScopes = JSON.parse(validatedKimi.tokenRecord!.scopes);
    expect(chatgptScopes).toContain("execute");
    expect(kimiScopes).not.toContain("execute");
  });

  it("token-rotation-isolation: rotating Kimi token does not alter ChatGPT token", () => {
    const chatgptTokenBefore = connectionService.createOrRotateToken("conn_chatgpt", ["read", "write", "execute"]);
    const kimiTokenBefore = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);

    // Rotate Kimi token
    const kimiTokenAfter = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);

    expect(kimiTokenAfter.tokenId).not.toBe(kimiTokenBefore.tokenId);
    expect(kimiTokenAfter.token).not.toBe(kimiTokenBefore.token);

    // Old Kimi token is now revoked
    expect(tokenService.validateMcpToken(kimiTokenBefore.token).valid).toBe(false);
    // New Kimi token is valid
    expect(tokenService.validateMcpToken(kimiTokenAfter.token).valid).toBe(true);

    // ChatGPT token remains completely untouched and active
    const chatgptConn = connectionService.getConnection("conn_chatgpt");
    expect(chatgptConn?.tokenId).toBe(chatgptTokenBefore.tokenId);
    expect(tokenService.validateMcpToken(chatgptTokenBefore.token).valid).toBe(true);
  });

  it("token-revoke-isolation: revoking Kimi token does not revoke ChatGPT token", () => {
    const chatgptToken = connectionService.createOrRotateToken("conn_chatgpt", ["read", "write", "execute"]);
    const kimiToken = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);

    // Revoke Kimi token
    const revoked = connectionService.revokeConnectionToken("conn_kimi_web");
    expect(revoked).toBe(true);

    // Kimi token is revoked
    expect(tokenService.validateMcpToken(kimiToken.token).valid).toBe(false);
    const kimiConn = connectionService.getConnection("conn_kimi_web");
    expect(kimiConn?.tokenId).toBeNull();

    // ChatGPT token is still valid
    expect(tokenService.validateMcpToken(chatgptToken.token).valid).toBe(true);
    const chatgptConn = connectionService.getConnection("conn_chatgpt");
    expect(chatgptConn?.tokenId).toBe(chatgptToken.tokenId);
  });

  it("token-redaction: masked secret lb_kimi_••••<4-HEX> is returned, never plaintext", () => {
    const result = connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);
    const conn = connectionService.getConnection("conn_kimi_web");

    expect(conn?.tokenMasked).toBeDefined();
    expect(conn?.tokenMasked).toMatch(/^lb_kimi_••••[0-9A-F]{4}$/);
    // Plaintext token is never stored or retrieved on the connection object
    expect((conn as any).token).toBeUndefined();
    expect(conn?.tokenMasked).not.toEqual(result.token);
  });
});

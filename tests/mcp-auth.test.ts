import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Authentication & Cross-Token Isolation", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let expiredToken: string;
  let revokedToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-auth-"));
    dbFilePath = path.join(tmpDir, "mcp-auth.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;

    // Create valid MCP token
    const createdMcp = serverInstance.tokenService.createToken({
      name: "mcp-test-client",
      type: "mcp",
      scopes: ["project:read", "project:write"],
    });
    mcpToken = createdMcp.token;

    // Create valid Runner token
    const createdRunner = serverInstance.tokenService.createToken({
      name: "runner-test-node",
      type: "runner",
    });
    runnerToken = createdRunner.token;

    // Create expired MCP token
    const createdExpired = serverInstance.tokenService.createToken({
      name: "mcp-expired",
      type: "mcp",
      expiresAt: Date.now() - 10000,
    });
    expiredToken = createdExpired.token;

    // Create revoked MCP token
    const createdRevoked = serverInstance.tokenService.createToken({
      name: "mcp-revoked",
      type: "mcp",
    });
    revokedToken = createdRevoked.token;
    serverInstance.tokenService.revokeToken(createdRevoked.id);
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  async function postMcp(body: any, headers: Record<string, string> = {}) {
    return fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        connection: "close",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("authenticates valid MCP token with Bearer scheme", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "req_1", method: "tools/list", params: {} },
      { authorization: `Bearer ${mcpToken}` }
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("localbridge_project_list");
  });

  it("rejects request missing Authorization header with 401", async () => {
    const res = await postMcp({
      jsonrpc: "2.0",
      id: "req_missing",
      method: "tools/list",
      params: {},
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("rejects request with malformed Authorization header with 401", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "req_basic", method: "tools/list", params: {} },
      { authorization: `Basic ${mcpToken}` }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("rejects non-existent MCP token with 401 TOKEN_NOT_FOUND", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "req_unknown", method: "tools/list", params: {} },
      {
        authorization:
          "Bearer lb_0000000000000000000000000000000000000000000000000000000000000000",
      }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("TOKEN_NOT_FOUND");
  });

  it("enforces cross-token isolation: rejects runner token (lbr_) on /mcp with 401 INVALID_TOKEN_TYPE", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "req_runner_on_mcp", method: "tools/list", params: {} },
      { authorization: `Bearer ${runnerToken}` }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("INVALID_TOKEN_TYPE");
  });

  it("enforces cross-token isolation: rejects MCP token (lb_) on runner websocket with 403", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/runner/ws`, {
      headers: { Authorization: `Bearer ${mcpToken}` },
      handshakeTimeout: 3000,
    });
    const errorPromise = new Promise<Error>((resolve) => {
      ws.on("error", (err) => resolve(err));
    });

    const err = await errorPromise;
    ws.terminate();
    expect(err.message).toContain("403");
  });

  it("rejects revoked MCP token with 401 TOKEN_REVOKED", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "req_revoked", method: "tools/list", params: {} },
      { authorization: `Bearer ${revokedToken}` }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("TOKEN_REVOKED");
  });

  it("rejects expired MCP token with 401 TOKEN_EXPIRED", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "req_expired", method: "tools/list", params: {} },
      { authorization: `Bearer ${expiredToken}` }
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("TOKEN_EXPIRED");
  });

  it("shields secrets: never leaks token hashes or raw tokens in error payloads", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: "req_tool_err",
        method: "tools/call",
        params: {
          name: "localbridge_project_info",
          arguments: { projectId: "non-existent-proj" },
        },
      },
      { authorization: `Bearer ${mcpToken}` }
    );

    expect(res.status).toBe(200);
    const rawText = await res.text();
    expect(rawText).not.toContain(mcpToken);
    expect(rawText).not.toContain("token_hash");
  });
});

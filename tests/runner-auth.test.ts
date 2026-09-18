import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Runner WebSocket Authentication", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;

  let validRunnerToken: string;
  let revokedRunnerToken: string;
  let expiredRunnerToken: string;
  let mcpToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-auth-test-"));
    dbFilePath = path.join(tmpDir, "auth-test.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    // Create test tokens
    const { tokenService } = serverInstance;

    // 1. Valid runner token
    const res1 = tokenService.createToken({ name: "Valid Runner", type: "runner" });
    validRunnerToken = res1.token;

    // 2. Revoked runner token
    const res2 = tokenService.createToken({ name: "Revoked Runner", type: "runner" });
    revokedRunnerToken = res2.token;
    tokenService.revokeToken(res2.id);

    // 3. Expired runner token
    const res3 = tokenService.createToken({
      name: "Expired Runner",
      type: "runner",
      expiresAt: Date.now() - 10000,
    });
    expiredRunnerToken = res3.token;

    // 4. MCP token
    const res4 = tokenService.createToken({ name: "MCP Client", type: "mcp" });
    mcpToken = res4.token;
  });

  afterAll(async () => {
    await serverInstance.app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function attemptConnection(token?: string): Promise<{ success: boolean; statusCode?: number }> {
    return new Promise((resolve) => {
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/runner/ws`, {
        headers,
        handshakeTimeout: 3000,
      });

      ws.on("open", () => {
        ws.close();
        resolve({ success: true, statusCode: 101 });
      });

      ws.on("unexpected-response", (_req, res) => {
        resolve({ success: false, statusCode: res.statusCode });
      });

      ws.on("error", () => {
        // Socket error usually accompanies unexpected-response
      });
    });
  }

  it("accepts valid runner token and establishes WebSocket connection", async () => {
    const result = await attemptConnection(validRunnerToken);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(101);
  });

  it("rejects connection without authorization token with 401", async () => {
    const result = await attemptConnection();
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("rejects MCP client (lb_) token with 403", async () => {
    const result = await attemptConnection(mcpToken);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it("rejects invalid lbr_ token with 401", async () => {
    const fakeToken = "lbr_0000000000000000000000000000000000000000000000000000000000000000";
    const result = await attemptConnection(fakeToken);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("rejects revoked runner token with 401", async () => {
    const result = await attemptConnection(revokedRunnerToken);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("rejects expired runner token with 401", async () => {
    const result = await attemptConnection(expiredRunnerToken);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
  });
});

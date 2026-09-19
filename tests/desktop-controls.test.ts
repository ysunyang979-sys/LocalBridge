import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 11: Global Pause & Emergency Stop Controls", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let mcpToken: string;
  let serverPort: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-controls-test-"));
    dbFilePath = path.join(tmpDir, "controls-test.db");

    serverPort = 19182;
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: serverPort, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    await app.listen({ port: serverPort, host: "127.0.0.1" });

    // Generate runner token
    const tokRun = result.tokenService.createToken({
      name: "controls-test-runner",
      type: "runner",
    });
    runnerToken = tokRun.token;

    // Generate MCP token
    const tokMcp = result.tokenService.createToken({
      name: "controls-test-mcp",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = tokMcp.token;

    // Start runner daemon
    const silentLogger = createLogger({ level: "silent" });
    runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "controls-test-runner",
        projectsPath: path.join(tmpDir, "projects.json"),
        statePath: path.join(tmpDir, "runner-state.json"),
        heartbeatIntervalMs: 5000,
        logging: { level: "silent", pretty: false },
        reconnect: {
          enabled: true,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          factor: 2,
          jitter: 0.1,
        },
      },
      silentLogger
    );

    await runner.start();
    await new Promise((r) => setTimeout(r, 600));
  });

  afterAll(async () => {
    await runner?.stop();
    await app?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("toggles Global Pause and blocks incoming MCP requests immediately", async () => {
    // 1. Initially unpaused
    const getRes1 = await app.inject({
      method: "GET",
      url: "/api/pause",
    });
    expect(getRes1.statusCode).toBe(200);
    expect(JSON.parse(getRes1.body).paused).toBe(false);

    // MCP status check
    const statusRes1 = await app.inject({
      method: "GET",
      url: "/api/mcp/status",
    });
    expect(JSON.parse(statusRes1.body).paused).toBe(false);
    expect(JSON.parse(statusRes1.body).mcpActive).toBe(true);

    // 2. Pause AI access
    const pauseRes = await app.inject({
      method: "POST",
      url: "/api/pause",
      payload: { paused: true },
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(JSON.parse(pauseRes.body).paused).toBe(true);

    // MCP status should now report paused
    const statusRes2 = await app.inject({
      method: "GET",
      url: "/api/mcp/status",
    });
    expect(JSON.parse(statusRes2.body).paused).toBe(true);
    expect(JSON.parse(statusRes2.body).mcpActive).toBe(false);

    // 3. POST /mcp MUST be rejected with HTTP 503
    const mcpResBlocked = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${mcpToken}`,
        host: "127.0.0.1:19182",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      },
    });
    expect(mcpResBlocked.statusCode).toBe(503);
    const mcpErrBody = JSON.parse(mcpResBlocked.body);
    expect(mcpErrBody.error.message).toContain("LocalBridge AI access is paused");

    // 4. Resume AI access
    const resumeRes = await app.inject({
      method: "POST",
      url: "/api/pause",
      payload: { paused: false },
    });
    expect(resumeRes.statusCode).toBe(200);
    expect(JSON.parse(resumeRes.body).paused).toBe(false);

    const statusRes3 = await app.inject({
      method: "GET",
      url: "/api/mcp/status",
    });
    expect(JSON.parse(statusRes3.body).paused).toBe(false);
    expect(JSON.parse(statusRes3.body).mcpActive).toBe(true);
  });

  it("triggers Emergency Stop: immediately pauses MCP and notifies runners", async () => {
    const emergencyRes = await app.inject({
      method: "POST",
      url: "/api/emergency-stop",
      payload: { reason: "Security incident detected" },
    });

    expect(emergencyRes.statusCode).toBe(200);
    const body = JSON.parse(emergencyRes.body);
    expect(body.emergencyStopped).toBe(true);
    expect(body.paused).toBe(true);
    expect(body.runnersNotified).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.jobIds)).toBe(true);

    // Verify MCP is now paused
    const statusRes = await app.inject({
      method: "GET",
      url: "/api/mcp/status",
    });
    expect(JSON.parse(statusRes.body).paused).toBe(true);
  });
});

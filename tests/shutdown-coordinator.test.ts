import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Shutdown Coordinator & Server Termination Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-shutdown-test-"));
    dbFilePath = path.join(tmpDir, "shutdown-test.db");

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
    const port = (serverInstance.app.server.address() as any).port;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    try {
      await serverInstance.app.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("server-shutdown-fast: POST /shutdown sets pause and completes boundedly within 600ms", async () => {
    expect(serverInstance.mcpContext.isPaused()).toBe(false);

    const start = Date.now();
    const res = await fetch(`${serverUrl}/api/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Unit test fast shutdown" }),
    });

    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shuttingDown).toBe(true);
    expect(serverInstance.mcpContext.isPaused()).toBe(true);
    // Bounded execution requirement: response under 600ms
    expect(elapsed).toBeLessThan(600);
  });

  it("server-shutdown-paused: rejected subsequent unprivileged operations once shutdown started", async () => {
    expect(serverInstance.mcpContext.isPaused()).toBe(true);

    const res = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "tools/call",
        params: { name: "localbridge_project_list" },
      }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error?.message).toContain("LocalBridge AI access is paused");
  });
});

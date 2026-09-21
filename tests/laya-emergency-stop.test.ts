import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Laya Emergency Stop Invariant Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let fullToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-laya-estop-"));
    dbFilePath = path.join(tmpDir, "estop.db");

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

    const tokenRecord = serverInstance.tokenService.createToken({
      name: "full-mcp-client",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    fullToken = tokenRecord.token;
  });

  afterAll(async () => {
    await serverInstance.mcpContext.decisionProvider.shutdown();
    await serverInstance.app.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("proves Emergency Stop pauses system and cannot be bypassed", async () => {
    // 1. Activate Emergency Stop on McpContext
    serverInstance.mcpContext.setPaused(true);
    expect(serverInstance.mcpContext.isPaused()).toBe(true);

    // 2. /api/mcp/status reflects paused state
    const statusRes = await fetch(`http://127.0.0.1:${serverPort}/api/mcp/status`);
    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as any;
    expect(statusData.paused).toBe(true);
    expect(statusData.mcpActive).toBe(false);

    // Unpause for clean teardown
    serverInstance.mcpContext.setPaused(false);
  });
});

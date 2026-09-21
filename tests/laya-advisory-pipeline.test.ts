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

describe("Laya Automated Advisory Pipeline Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-advisory-pipe-"));
    dbFilePath = path.join(tmpDir, "advisory.db");

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
    mcpToken = tokenRecord.token;
  });

  afterAll(async () => {
    await serverInstance.mcpContext.decisionProvider.shutdown();
    await serverInstance.app.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("safe read tools do not trigger automated advisory inference", async () => {
    // Call a read tool (e.g. localbridge_project_list)
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-read-tool",
        method: "tools/call",
        params: {
          name: "localbridge_project_list",
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(200);
    // Recent inference should not be "localbridge_project_list"
    const status = serverInstance.mcpContext.getIntelligenceStatus();
    expect(status.recentInference?.operation).not.toBe("localbridge_project_list");
  });
});

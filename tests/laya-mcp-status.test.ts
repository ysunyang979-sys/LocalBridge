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

describe("Laya MCP Status Tool Suite (localbridge_laya_status)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let readToken: string;
  let writeOnlyToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-laya-status-"));
    dbFilePath = path.join(tmpDir, "status.db");

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
      name: "mcp-read-token",
      type: "mcp",
      scopes: ["read"],
    });
    readToken = tokenRecord.token;

    const writeTokenRecord = serverInstance.tokenService.createToken({
      name: "mcp-write-token",
      type: "mcp",
      scopes: ["write"],
    });
    writeOnlyToken = writeTokenRecord.token;
  });

  afterAll(async () => {
    await serverInstance.mcpContext.decisionProvider.shutdown();
    await serverInstance.app.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("successfully returns Laya status via MCP tools/call with read scope", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-laya-status",
        method: "tools/call",
        params: {
          name: "localbridge_laya_status",
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeFalsy();

    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toHaveProperty("enabled");
    expect(parsed).toHaveProperty("provider");
    expect(parsed).toHaveProperty("workerReady");
    expect(parsed).toHaveProperty("modelLoaded");
    expect(parsed).toHaveProperty("inferenceReady");
    expect(parsed).toHaveProperty("modelPathConfigured");
    expect(parsed).toHaveProperty("lastInferenceAt");
    expect(parsed).toHaveProperty("lastInferenceLatencyMs");
  });

  it("denies access if token does not have read scope", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${writeOnlyToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-laya-status-denied",
        method: "tools/call",
        params: {
          name: "localbridge_laya_status",
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32003);
    expect(body.error.message).toContain("requires scope \"read\"");
  });
});

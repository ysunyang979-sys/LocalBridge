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

describe("Laya MCP Assess Tool Suite (localbridge_laya_assess)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let readToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-laya-assess-"));
    dbFilePath = path.join(tmpDir, "assess.db");

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
  });

  afterAll(async () => {
    await serverInstance.mcpContext.decisionProvider.shutdown();
    await serverInstance.app.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("successfully performs an advisory risk assessment on operation", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-laya-assess-1",
        method: "tools/call",
        params: {
          name: "localbridge_laya_assess",
          arguments: {
            operation: "file_delete",
            target: "src/critical-config.ts",
            description: "Deleting core application configuration",
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();

    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toHaveProperty("risk");
    expect(["low", "medium", "high", "critical"]).toContain(parsed.risk);
    expect(parsed).toHaveProperty("recommendation");
    expect(["approve", "review", "deny"]).toContain(parsed.recommendation);
    expect(parsed).toHaveProperty("confidence");
    expect(typeof parsed.confidence).toBe("number");
    expect(parsed).toHaveProperty("category");
    expect(parsed).toHaveProperty("providerUsed");
    expect(parsed).toHaveProperty("fallbackUsed");
    expect(parsed).toHaveProperty("inferenceExecuted");

    // Check that context recorded the recent inference
    const status = serverInstance.mcpContext.getIntelligenceStatus();
    expect(status.recentInference).toBeDefined();
    expect(status.recentInference?.source).toBe("chatgpt");
    expect(status.recentInference?.operation).toBe("file_delete");
  });

  it("fails with validation error when required operation is omitted", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-laya-assess-invalid",
        method: "tools/call",
        params: {
          name: "localbridge_laya_assess",
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result?.isError).toBe(true);
  });
});

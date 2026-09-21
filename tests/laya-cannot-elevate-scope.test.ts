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

describe("Laya Advisory Zero Scope Elevation Invariant Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let readOnlyToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-zero-elevation-"));
    dbFilePath = path.join(tmpDir, "elevation.db");

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
      name: "strictly-read-only-client",
      type: "mcp",
      scopes: ["read"],
    });
    readOnlyToken = tokenRecord.token;
  });

  afterAll(async () => {
    await serverInstance.mcpContext.decisionProvider.shutdown();
    await serverInstance.app.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("proves read-only token CANNOT call mutating tools even if Laya assesses them as low risk", async () => {
    // 1. First query Laya assess tool - should succeed since assess is "read" scope
    const assessRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readOnlyToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "assess-before-mutate",
        method: "tools/call",
        params: {
          name: "localbridge_laya_assess",
          arguments: {
            operation: "file_write",
            target: "safe.txt",
          },
        },
      }),
    });
    expect(assessRes.status).toBe(200);

    // 2. Now attempt to actually call localbridge_file_write (requires "write" scope)
    const writeRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readOnlyToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-write-forbidden",
        method: "tools/call",
        params: {
          name: "localbridge_file_write",
          arguments: {
            projectId: "p1",
            path: "safe.txt",
            content: "hello",
          },
        },
      }),
    });

    expect(writeRes.status).toBe(403);
    const body = (await writeRes.json()) as any;
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32003);
    expect(body.error.message).toContain("requires scope \"write\"");
  });

  it("proves read-only token CANNOT call command execution tools", async () => {
    const cmdRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${readOnlyToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-cmd-forbidden",
        method: "tools/call",
        params: {
          name: "localbridge_command_run",
          arguments: {
            projectId: "p1",
            spec: { kind: "tool_version", tool: "node" },
          },
        },
      }),
    });

    expect(cmdRes.status).toBe(403);
    const body = (await cmdRes.json()) as any;
    expect(body.error.message).toContain("requires scope \"execute\"");
  });
});

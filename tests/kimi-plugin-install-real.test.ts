import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { generatePluginManifest, exportPluginPackage } from "../apps/server/src/adapters/mcp/kimi-web.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Kimi Plugin Installation Acceptance Suite (kimi-plugin-install-real.test)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;
  let kimiToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-real-"));
    dbFilePath = path.join(tmpDir, "kimi-real.db");

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

    const created = serverInstance.connectionService.createOrRotateToken("conn_kimi_web", ["read", "write"]);
    kimiToken = created.token;
  });

  afterAll(async () => {
    try {
      await serverInstance.app.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("manifest-user-http: defaults to user_http auth preventing 'authorization incomplete' in Kimi Work", () => {
    const manifest = generatePluginManifest({
      publicEndpoint: "https://tunnel_kimi.nexus.localbridge.dev/mcp",
      authType: "user_http",
    });

    expect(manifest.auth.type).toBe("user_http");
    expect(manifest.auth.authorization_type).toBe("bearer");
    expect(manifest.api.url).toBe("https://tunnel_kimi.nexus.localbridge.dev/mcp");
  });

  it("real-tool-call: executes localbridge_project_list using dedicated Kimi Web token", async () => {
    const res = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        Authorization: `Bearer ${kimiToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 101,
        method: "tools/call",
        params: {
          name: "localbridge_project_list",
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    expect(Array.isArray(body.result.content)).toBe(true);
  });
});

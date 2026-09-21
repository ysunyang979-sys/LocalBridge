import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { KimiAuthTraceCollector } from "../apps/server/src/auth/kimi-auth-trace.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Kimi Real Auth Trace Pipeline Suite (kimi-real-auth-trace.test)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-realtrace-"));
    dbFilePath = path.join(tmpDir, "kimi-realtrace.db");

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

  it("records real lifecycle trace from probe to authenticated request", async () => {
    const collector = KimiAuthTraceCollector.getInstance();
    collector.clear();

    // 1. Unauthenticated probe -> 401
    const probeRes = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "Host": "tunnel_live.nexus.localbridge.dev",
        "X-Forwarded-Proto": "https",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(probeRes.status).toBe(401);

    // 2. Discovery -> 200
    const discRes = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`, {
      headers: {
        "Host": "tunnel_live.nexus.localbridge.dev",
        "X-Forwarded-Proto": "https",
      },
    });
    expect(discRes.status).toBe(200);

    // 3. Inspect collector traces
    const traces = collector.getRecentTraces();
    expect(traces.length).toBeGreaterThanOrEqual(2);

    const probeTrace = traces.find((t) => t.path === "/mcp" && t.statusCode === 401);
    expect(probeTrace).toBeDefined();
    expect(probeTrace?.oauthStage).toBe("mcp-probe");
    expect(probeTrace?.wwwAuthenticatePresent).toBe(true);

    const discTrace = traces.find((t) => t.path === "/.well-known/oauth-authorization-server");
    expect(discTrace).toBeDefined();
    expect(discTrace?.oauthStage).toBe("oauth-discovery");
    expect(discTrace?.statusCode).toBe(200);

    // 4. Trace summary string formatting
    const summary = collector.formatSummary();
    expect(summary.some((line) => line.includes("POST /mcp -> 401"))).toBe(true);
    expect(summary.some((line) => line.includes("GET /.well-known/oauth-authorization-server -> 200"))).toBe(true);
  });
});

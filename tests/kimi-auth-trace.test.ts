import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { KimiAuthTraceCollector } from "../apps/server/src/auth/kimi-auth-trace.js";
import { resolvePublicOrigin } from "../apps/server/src/auth/origin-resolver.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Kimi Auth Trace & Origin Resolver Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let customLogPath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-trace-"));
    dbFilePath = path.join(tmpDir, "kimi-trace.db");
    customLogPath = path.join(tmpDir, "custom-kimi-trace.jsonl");

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

  it("origin-resolver: resolves public origin and strictly rejects loopback/private hosts", () => {
    // 1. With x-forwarded-host
    const reqWithForwarded: any = {
      headers: {
        "x-forwarded-host": "tunnel_abc.nexus.localbridge.dev",
        "x-forwarded-proto": "https",
        host: "127.0.0.1:18080",
      },
    };
    const origin1 = resolvePublicOrigin(reqWithForwarded);
    expect(origin1).toBe("https://tunnel_abc.nexus.localbridge.dev");

    // 2. With fallback public host when host is 127.0.0.1:18080
    const reqLocal: any = {
      headers: {
        host: "127.0.0.1:18080",
      },
    };
    const origin2 = resolvePublicOrigin(reqLocal, "https://live-tunnel.nexus.localbridge.dev");
    expect(origin2).toBe("https://live-tunnel.nexus.localbridge.dev");

    // 3. Guaranteed https for public domain
    const reqHttpDomain: any = {
      headers: {
        host: "tunnel-xyz.trycloudflare.com",
      },
    };
    const origin3 = resolvePublicOrigin(reqHttpDomain);
    expect(origin3).toBe("https://tunnel-xyz.trycloudflare.com");
  });

  it("kimi-auth-trace-collector: enforces redaction and circular buffer", () => {
    const collector = new KimiAuthTraceCollector(customLogPath);
    collector.clear();

    collector.record({
      timestamp: new Date().toISOString(),
      method: "POST",
      path: "/mcp",
      statusCode: 401,
      authorizationPresent: false,
      wwwAuthenticatePresent: true,
      oauthStage: "mcp-probe",
      resource: "https://tunnel.nexus.localbridge.dev/mcp",
      redirectUriHostOnly: "https://kimi.com/oauth/callback?code=secret123",
    });

    const traces = collector.getRecentTraces();
    expect(traces.length).toBe(1);
    expect(traces[0].statusCode).toBe(401);
    // Ensure query params or secrets stripped in host-only redirect URI
    expect(traces[0].redirectUriHostOnly).toBe("kimi.com");
    expect(traces[0].redirectUriHostOnly).not.toContain("secret123");

    const summary = collector.formatSummary();
    expect(summary.length).toBe(1);
    expect(summary[0]).toContain("POST /mcp -> 401");
    expect(summary[0]).toContain("WWW-Authenticate sent");
  });

  it("server-mcp-401: probe returns RFC 9470 WWW-Authenticate and Link headers with genuine origin", async () => {
    const collector = KimiAuthTraceCollector.getInstance();
    collector.clear();

    const res = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "x-forwarded-host": "tunnel_prod123.nexus.localbridge.dev",
        "x-forwarded-proto": "https",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('resource_metadata="https://tunnel_prod123.nexus.localbridge.dev/.well-known/oauth-protected-resource"');
    expect(wwwAuth).toContain('as_uri="https://tunnel_prod123.nexus.localbridge.dev"');

    const link = res.headers.get("Link");
    expect(link).toBe('<https://tunnel_prod123.nexus.localbridge.dev/.well-known/oauth-protected-resource>; rel="describedby"');

    // Check trace was recorded in collector
    const traces = collector.getRecentTraces();
    expect(traces.some((t) => t.statusCode === 401 && t.path === "/mcp")).toBe(true);
  });

  it("server-oauth-discovery: /.well-known endpoints record discovery trace and return genuine metadata", async () => {
    const resRes = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`, {
      headers: {
        "x-forwarded-host": "tunnel_prod123.nexus.localbridge.dev",
        "x-forwarded-proto": "https",
      },
    });
    expect(resRes.status).toBe(200);
    const resData = await resRes.json();
    expect(resData.resource).toBe("https://tunnel_prod123.nexus.localbridge.dev/mcp");
    expect(resData.authorization_servers).toContain("https://tunnel_prod123.nexus.localbridge.dev");

    const authRes = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`, {
      headers: {
        "x-forwarded-host": "tunnel_prod123.nexus.localbridge.dev",
        "x-forwarded-proto": "https",
      },
    });
    expect(authRes.status).toBe(200);
    const authData = await authRes.json();
    expect(authData.issuer).toBe("https://tunnel_prod123.nexus.localbridge.dev");
    expect(authData.authorization_endpoint).toBe("https://tunnel_prod123.nexus.localbridge.dev/oauth/authorize");
    expect(authData.token_endpoint).toBe("https://tunnel_prod123.nexus.localbridge.dev/oauth/token");

    // Test OpenID configuration alias
    const openidRes = await fetch(`${serverUrl}/.well-known/openid-configuration`, {
      headers: {
        "x-forwarded-host": "tunnel_prod123.nexus.localbridge.dev",
        "x-forwarded-proto": "https",
      },
    });
    expect(openidRes.status).toBe(200);
  });

  it("management-auth-trace: exposes GET /management/connections/kimi-web/auth-trace", async () => {
    const res = await fetch(`${serverUrl}/api/management/connections/kimi-web/auth-trace`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.traces)).toBe(true);
    expect(Array.isArray(data.summary)).toBe(true);
    expect(data.traces.length).toBeGreaterThan(0);
  });
});

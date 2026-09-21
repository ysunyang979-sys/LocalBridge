import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Kimi Web MCP Real Auth & Attribution Flow Suite", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;
  let kimiToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-kimi-auth-"));
    dbFilePath = path.join(tmpDir, "kimi-auth.db");

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

    // Create Kimi Web dedicated token with read/write scopes
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

  it("kimi-real-auth-flow: unauthenticated probe to /mcp returns 401 with RFC 9207 discovery headers", async () => {
    const res = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "Kimi Web", version: "1.0.0" },
        },
      }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('Bearer realm="Nexus"');
    expect(wwwAuth).toContain('error="invalid_token"');

    const linkHeader = res.headers.get("Link");
    expect(linkHeader).toBeTruthy();
    expect(linkHeader).toContain(".well-known/oauth-protected-resource");
    expect(linkHeader).toContain('rel="describedby"');
  });

  it("tunnel-host-allowed: allows public tunnel hostnames but rejects arbitrary malicious hosts", async () => {
    // 1. Cloudflare / localbridge tunnel host must be allowed past host validation (returns 401 auth challenge, NOT 403 host not allowed)
    const tunnelRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const parsedUrl = new URL(serverUrl);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: "/mcp",
          method: "POST",
          headers: {
            "Host": "tunnel_test123.nexus.localbridge.dev",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
      req.end();
    });
    expect(tunnelRes.status).toBe(401);

    // 2. Foreign malicious host must be rejected with 403 HOST_NOT_ALLOWED
    const maliciousRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const parsedUrl = new URL(serverUrl);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: "/mcp",
          method: "POST",
          headers: {
            "Host": "attacker.malicious-site.com",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
      req.end();
    });
    expect(maliciousRes.status).toBe(403);
    expect(maliciousRes.body).toContain("HOST_NOT_ALLOWED");
  });

  it("kimi-client-attribution: authenticates Kimi token and correctly records client attribution", async () => {
    const res = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${kimiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
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
    expect(body.result).toBeDefined();

    // Check audit logs recorded in in-memory buffer
    const auditEvents = serverInstance.mcpContext.getAuditEvents(10);
    const kimiEvent = auditEvents.find(
      (e) => e.clientType === "kimi-web" || e.clientName === "Kimi Web"
    );
    expect(kimiEvent).toBeDefined();
    expect(kimiEvent?.clientName).toBe("Kimi Web");
    expect(kimiEvent?.clientType).toBe("kimi-web");
  });

  it("kimi-readonly-scope: scope policy strictly blocks execution when token has read only", async () => {
    const readOnlyTokenResult = serverInstance.connectionService.createOrRotateToken("conn_kimi_web", ["read"]);
    const readOnlyToken = readOnlyTokenResult.token;

    // 1. Tool call allowed for read: localbridge_project_list
    const listRes = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${readOnlyToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 102,
        method: "tools/call",
        params: {
          name: "localbridge_project_list",
          arguments: {},
        },
      }),
    });

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.error?.code).not.toBe(-32003);

    // 2. Tool call requiring execute: runner_command_run -> must be rejected by scope (HTTP 403 Forbidden)
    const execRes = await fetch(`${serverUrl}/mcp`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${readOnlyToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 103,
        method: "tools/call",
        params: {
          name: "runner_command_run",
          arguments: { command: "dir" },
        },
      }),
    });

    // Scope policy rejection returns 403 Forbidden
    expect(execRes.status).toBe(403);
    const execBody = await execRes.json();
    expect(execBody.error || execBody.message).toBeTruthy();
  });
});

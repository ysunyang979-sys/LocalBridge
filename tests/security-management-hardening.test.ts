import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { loadConfig } from "@localbridge/shared";

describe("Phase 12 - Security Management Hardening & Token Domain Isolation", () => {
  let tmpDir: string;
  let serverInstance: BuiltAppResult;
  let mcpToken: string;
  let runnerToken: string;
  let managementToken: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mgmt-hardening-test-"));
    const dbPath = path.join(tmpDir, "server.db");

    const baseConfig = loadConfig({
      configPath: path.join(tmpDir, "config.json"),
      cliArgs: ["--port", "0", "--db-path", dbPath],
    });

    managementToken = `lm_${"a".repeat(64)}`;
    serverInstance = await buildApp({
      config: baseConfig,
      enableLogging: false,
      managementSecret: managementToken,
      requireManagementAuth: true,
    });

    // Create tokens for all three domains
    const mcpRes = serverInstance.tokenService.createToken({
      name: "Test MCP",
      type: "mcp",
    });
    mcpToken = mcpRes.token;

    const runnerRes = serverInstance.tokenService.createToken({
      name: "Test Runner",
      type: "runner",
    });
    runnerToken = runnerRes.token;

  });

  afterEach(async () => {
    if (serverInstance?.app) {
      await serverInstance.app.close();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("blocks browser-origin attacks from malicious web origins and cross-site requests", async () => {
    // 1. Attack from malicious external website via fetch() with Origin header
    const maliciousOriginRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        origin: "http://malicious-website.example",
      },
    });

    expect(maliciousOriginRes.statusCode).toBe(403);
    const originBody = JSON.parse(maliciousOriginRes.body);
    expect(originBody.code).toBe("BROWSER_CROSS_ORIGIN_FORBIDDEN");

    // 2. Attack with Sec-Fetch-Site: cross-site header
    const crossSiteRes = await serverInstance.app.inject({
      method: "POST",
      url: "/api/pause",
      headers: {
        "sec-fetch-site": "cross-site",
      },
      payload: { paused: true },
    });

    expect(crossSiteRes.statusCode).toBe(403);
    const crossSiteBody = JSON.parse(crossSiteRes.body);
    expect(crossSiteBody.code).toBe("BROWSER_CROSS_ORIGIN_FORBIDDEN");

    // 3. DNS Rebinding / Host header spoofing attack
    const evilHostRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        host: "evil-dns-rebound-domain.com",
      },
    });

    expect(evilHostRes.statusCode).toBe(403);
    const hostBody = JSON.parse(evilHostRes.body);
    expect(hostBody.code).toBe("HOST_NOT_ALLOWED");

    // 4. Legitimate Tauri desktop app origin allows access
    const tauriOriginRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        origin: "tauri://localhost",
        authorization: `Bearer ${managementToken}`,
      },
    });

    expect(tauriOriginRes.statusCode).toBe(200);

    // 5. Legitimate localhost dev origin allows access
    const localOriginRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        origin: "http://127.0.0.1:1420",
        authorization: `Bearer ${managementToken}`,
      },
    });

    expect(localOriginRes.statusCode).toBe(200);
  });

  it("requires lm_ authentication on management read APIs", async () => {
    for (const url of ["/api/status", "/api/runners", "/api/projects"]) {
      const missing = await serverInstance.app.inject({ method: "GET", url });
      expect(missing.statusCode, url).toBe(401);
      const valid = await serverInstance.app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${managementToken}` },
      });
      expect(valid.statusCode, url).toBe(200);
    }
    const health = await serverInstance.app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ ok: true });
  });

  it("enforces strict three-domain token isolation (lb_, lbr_, lm_ cannot be swapped)", async () => {
    // 1. Calling Management API with MCP token (lb_) -> 401 INVALID_TOKEN_TYPE
    const mcpOnMgmt = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        authorization: `Bearer ${mcpToken}`,
      },
    });
    expect(mcpOnMgmt.statusCode).toBe(401);
    expect(JSON.parse(mcpOnMgmt.body).code).toBe("INVALID_TOKEN_TYPE");

    // 2. Calling Management API with Runner token (lbr_) -> 401 INVALID_TOKEN_TYPE
    const runnerOnMgmt = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        authorization: `Bearer ${runnerToken}`,
      },
    });
    expect(runnerOnMgmt.statusCode).toBe(401);
    expect(JSON.parse(runnerOnMgmt.body).code).toBe("INVALID_TOKEN_TYPE");

    // 3. Calling Management API with valid Management token (lm_) -> 200 OK
    const mgmtOnMgmt = await serverInstance.app.inject({
      method: "GET",
      url: "/api/tokens",
      headers: {
        authorization: `Bearer ${managementToken}`,
      },
    });
    expect(mgmtOnMgmt.statusCode).toBe(200);

    // 4. Calling MCP endpoint with Management token (lm_) -> 401 INVALID_TOKEN_TYPE
    const mgmtOnMcp = await serverInstance.app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${managementToken}`,
        "mcp-protocol-version": "2026-07-28",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      },
    });
    expect(mgmtOnMcp.statusCode).toBe(401);
    expect(JSON.parse(mgmtOnMcp.body).code).toBe("INVALID_TOKEN_TYPE");

    // 5. Calling MCP endpoint with Runner token (lbr_) -> 401 INVALID_TOKEN_TYPE
    const runnerOnMcp = await serverInstance.app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${runnerToken}`,
        "mcp-protocol-version": "2026-07-28",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      },
    });
    expect(runnerOnMcp.statusCode).toBe(401);
    expect(JSON.parse(runnerOnMcp.body).code).toBe("INVALID_TOKEN_TYPE");
  });
});

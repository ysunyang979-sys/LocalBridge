import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { loadConfig } from "@localbridge/shared";

describe("Regression: Desktop Trusted Tauri IPC & Browser Cross-Site Isolation", () => {
  let tmpDir: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  const managementToken = "lm_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-desktop-ipc-reg-"));
    const dbPath = path.join(tmpDir, "server.db");

    const baseConfig = loadConfig({
      configPath: path.join(tmpDir, "config.json"),
      cliArgs: ["--port", "0", "--db-path", dbPath],
    });

    serverInstance = await buildApp({
      config: baseConfig,
      enableLogging: false,
      managementSecret: managementToken,
      requireManagementAuth: true,
    });

    // Create MCP and Runner tokens for domain isolation checks
    const mcpRes = serverInstance.tokenService.createToken({
      name: "Test MCP Token",
      type: "mcp",
    });
    mcpToken = mcpRes.token;

    const runnerRes = serverInstance.tokenService.createToken({
      name: "Test Runner Token",
      type: "runner",
    });
    runnerToken = runnerRes.token;

    const address = await serverInstance.app.listen({
      host: "127.0.0.1",
      port: 0,
    });
    const addr = serverInstance.app.server.address();
    serverPort = typeof addr === "object" && addr ? addr.port : 18080;
  });

  afterEach(async () => {
    if (serverInstance?.app) {
      await serverInstance.app.close();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Helper simulating Rust loopback HTTP client
  function rustLoopbackRequest(
    method: string,
    reqPath: string,
    body?: any,
    customHeaders: Record<string, string> = {}
  ): Promise<{ statusCode: number; headers: string[]; body: string }> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port: serverPort }, () => {
        const bodyStr = body ? JSON.stringify(body) : "";
        const bodyBuf = Buffer.from(bodyStr, "utf-8");

        let headerStr = `${method} ${reqPath} HTTP/1.1\r\nHost: 127.0.0.1:${serverPort}\r\nConnection: close\r\n`;
        for (const [k, v] of Object.entries(customHeaders)) {
          headerStr += `${k}: ${v}\r\n`;
        }
        if (bodyBuf.length > 0) {
          if (!customHeaders["Content-Type"]) {
            headerStr += "Content-Type: application/json\r\n";
          }
          headerStr += `Content-Length: ${bodyBuf.length}\r\n`;
        } else {
          headerStr += "Content-Length: 0\r\n";
        }
        headerStr += "\r\n";

        socket.write(headerStr);
        if (bodyBuf.length > 0) {
          socket.write(bodyBuf);
        }
      });

      let rawData = "";
      socket.on("data", (chunk) => {
        rawData += chunk.toString("utf-8");
      });

      socket.on("end", () => {
        const parts = rawData.split("\r\n\r\n");
        const headerLines = parts[0].split("\r\n");
        const statusLine = headerLines[0] || "";
        const statusCode = parseInt(statusLine.split(" ")[1] || "500", 10);
        const body = parts.slice(1).join("\r\n\r\n");
        resolve({ statusCode, headers: headerLines, body });
      });

      socket.on("error", (err) => {
        reject(err);
      });
    });
  }

  it("1. blocks requests from malicious browser Origin with 403", async () => {
    const res = await rustLoopbackRequest("GET", "/api/tokens", undefined, {
      Origin: "http://malicious.example",
      Authorization: `Bearer ${managementToken}`,
    });

    expect(res.statusCode).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("BROWSER_CROSS_ORIGIN_FORBIDDEN");
  });

  it("2. blocks requests with Sec-Fetch-Site: cross-site + malicious origin with 403", async () => {
    const res = await rustLoopbackRequest(
      "POST",
      "/api/pause",
      { paused: true },
      {
        Origin: "http://malicious.example",
        "Sec-Fetch-Site": "cross-site",
        Authorization: `Bearer ${managementToken}`,
      }
    );

    expect(res.statusCode).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("BROWSER_CROSS_ORIGIN_FORBIDDEN");
  });

  it("3. rejects requests without lm_ token with 401 MISSING_TOKEN", async () => {
    const res = await rustLoopbackRequest("GET", "/api/tokens");

    expect(res.statusCode).toBe(401);
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("MISSING_TOKEN");
  });

  it("4. rejects MCP token (lb_) calling management endpoints with 401 INVALID_TOKEN_TYPE", async () => {
    const res = await rustLoopbackRequest("GET", "/api/tokens", undefined, {
      Authorization: `Bearer ${mcpToken}`,
    });

    expect(res.statusCode).toBe(401);
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("INVALID_TOKEN_TYPE");
  });

  it("5. rejects Runner token (lbr_) calling management endpoints with 401 INVALID_TOKEN_TYPE", async () => {
    const res = await rustLoopbackRequest("GET", "/api/tokens", undefined, {
      Authorization: `Bearer ${runnerToken}`,
    });

    expect(res.statusCode).toBe(401);
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("INVALID_TOKEN_TYPE");
  });

  it("6. allows lm_ token + loopback Rust backend request without browser headers = PASS", async () => {
    // Simulates Rust desktop_management_call making a loopback call with lm_ token
    const res = await rustLoopbackRequest(
      "POST",
      "/api/tokens",
      {
        name: "Desktop Created MCP Token",
        type: "mcp",
      },
      {
        Authorization: `Bearer ${managementToken}`,
      }
    );

    expect(res.statusCode).toBe(201);
    const parsed = JSON.parse(res.body);
    expect(parsed.token).toMatch(/^lb_/);
    expect(parsed.name).toBe("Desktop Created MCP Token");
  });

  it("7. verifies Desktop trusted IPC management operations succeed", async () => {
    // 7.1 Pause / Resume
    const pauseRes = await rustLoopbackRequest(
      "POST",
      "/api/pause",
      { paused: true },
      { Authorization: `Bearer ${managementToken}` }
    );
    expect(pauseRes.statusCode).toBe(200);
    expect(JSON.parse(pauseRes.body).paused).toBe(true);

    const resumeRes = await rustLoopbackRequest(
      "POST",
      "/api/pause",
      { paused: false },
      { Authorization: `Bearer ${managementToken}` }
    );
    expect(resumeRes.statusCode).toBe(200);
    expect(JSON.parse(resumeRes.body).paused).toBe(false);

    // 7.2 Emergency Stop
    const stopRes = await rustLoopbackRequest(
      "POST",
      "/api/emergency-stop",
      { reason: "Integration test emergency stop" },
      { Authorization: `Bearer ${managementToken}` }
    );
    expect(stopRes.statusCode).toBe(200);
    const stopBody = JSON.parse(stopRes.body);
    expect(stopBody.emergencyStopped).toBe(true);

    // 7.3 List Audit
    const auditRes = await rustLoopbackRequest(
      "GET",
      "/api/audit?limit=10",
      undefined,
      { Authorization: `Bearer ${managementToken}` }
    );
    expect(auditRes.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(auditRes.body).events)).toBe(true);

    // 7.4 Token Lifecycle
    const createTokRes = await rustLoopbackRequest(
      "POST",
      "/api/tokens",
      { name: "Lifecycle Token", type: "runner" },
      { Authorization: `Bearer ${managementToken}` }
    );
    expect(createTokRes.statusCode).toBe(201);
    const createdToken = JSON.parse(createTokRes.body);
    expect(createdToken.token).toMatch(/^lbr_/);

    const revokeTokRes = await rustLoopbackRequest(
      "DELETE",
      `/api/tokens/${createdToken.id}`,
      undefined,
      { Authorization: `Bearer ${managementToken}` }
    );
    expect(revokeTokRes.statusCode).toBe(200);
  });
});

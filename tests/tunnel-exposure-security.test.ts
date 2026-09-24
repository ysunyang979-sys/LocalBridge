import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { buildApp } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

describe("P1 Security: Tunnel Exposure & Management Route Hardening", () => {
  let app: any;
  let tmpDir: string;
  let dbFilePath: string;
  let tokenService: any;
  const migrationsDir = path.resolve(process.cwd(), "apps/server/src/db/migrations");

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-tunnel-test-"));
    dbFilePath = path.join(tmpDir, "test.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 18080, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    tokenService = result.tokenService;
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("1. Management Routes Proxy Defense", () => {
    it("allows direct local request to /api/tokens without proxy headers", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/tokens",
        headers: {
          host: "127.0.0.1:18080",
        },
        remoteAddress: "127.0.0.1",
      });
      // 200 or 401 (if management auth required), but NOT 403 LOOPBACK/PROXY rejection
      expect(res.statusCode).not.toBe(403);
    });

    it("rejects request to /api/tokens with X-Forwarded-For even if from 127.0.0.1", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/tokens",
        headers: {
          host: "127.0.0.1:18080",
          "x-forwarded-for": "203.0.113.195",
        },
        remoteAddress: "127.0.0.1",
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/代理/);
    });

    it("rejects request to /api/emergency-stop with CF-Connecting-IP even if from 127.0.0.1", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/emergency-stop",
        headers: {
          host: "127.0.0.1:18080",
          "cf-connecting-ip": "198.51.100.4",
        },
        remoteAddress: "127.0.0.1",
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/代理/);
    });

    it("rejects request to /api/pause with X-Real-IP even if from 127.0.0.1", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/pause",
        headers: {
          host: "127.0.0.1:18080",
          "x-real-ip": "198.51.100.5",
        },
        remoteAddress: "127.0.0.1",
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/代理/);
    });

    it("rejects request to /api/approvals with Forwarded header even if from 127.0.0.1", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/approvals",
        headers: {
          host: "127.0.0.1:18080",
          forwarded: "for=198.51.100.6;proto=https",
        },
        remoteAddress: "127.0.0.1",
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/代理/);
    });

    it("rejects request to /api/tokens with trycloudflare host header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/tokens",
        headers: {
          host: "random-attacker.trycloudflare.com",
        },
        remoteAddress: "127.0.0.1",
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("2. /mcp Route Host Validation Convergence", () => {
    it("rejects arbitrary *.trycloudflare.com wildcard host on /mcp when no tunnel is active", async () => {
      const token = tokenService.createToken({
        name: "Test MCP Token",
        type: "mcp",
        scopes: ["read"],
      });

      const res = await app.inject({
        method: "POST",
        url: "/mcp",
        headers: {
          host: "random-attacker.trycloudflare.com",
          authorization: `Bearer ${token.token}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("HOST_NOT_ALLOWED");
    });
  });
});

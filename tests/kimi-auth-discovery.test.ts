import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Kimi OAuth Discovery Protocol Suite (kimi-auth-discovery.test)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-auth-disc-"));
    dbFilePath = path.join(tmpDir, "auth-disc.db");

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

  it("oauth-discovery: returns valid RFC 8414 / RFC 9470 metadata with HTTPS for tunnel domains", async () => {
    const res = await fetch(`${serverUrl}/.well-known/oauth-authorization-server`, {
      headers: {
        "x-forwarded-host": "tunnel_kimi.nexus.localbridge.dev",
        "X-Forwarded-Proto": "https",
      },
    });

    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.issuer).toBe("https://tunnel_kimi.nexus.localbridge.dev");
    expect(meta.authorization_endpoint).toBe("https://tunnel_kimi.nexus.localbridge.dev/oauth/authorize");
    expect(meta.token_endpoint).toBe("https://tunnel_kimi.nexus.localbridge.dev/oauth/token");
    expect(meta.code_challenge_methods_supported).toContain("S256");
  });

  it("openid-config-alias: returns openid configuration identical to oauth metadata", async () => {
    const res = await fetch(`${serverUrl}/.well-known/openid-configuration`, {
      headers: {
        "x-forwarded-host": "tunnel_kimi.nexus.localbridge.dev",
        "X-Forwarded-Proto": "https",
      },
    });

    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.issuer).toBe("https://tunnel_kimi.nexus.localbridge.dev");
  });

  it("oauth-protected-resource: returns resource metadata referencing the public origin", async () => {
    const res = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`, {
      headers: {
        "x-forwarded-host": "tunnel_kimi.nexus.localbridge.dev",
        "X-Forwarded-Proto": "https",
      },
    });

    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.resource).toBe("https://tunnel_kimi.nexus.localbridge.dev/mcp");
    expect(meta.authorization_servers).toContain("https://tunnel_kimi.nexus.localbridge.dev");
  });
});

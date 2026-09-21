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

describe("Skills Desktop IPC & Management Auth Security", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  const testManagementSecret = "lm_0123456789abcdef0123456789abcdef";

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-auth-test-"));
    dbFilePath = path.join(tmpDir, "skills_auth.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
      managementSecret: testManagementSecret,
      requireManagementAuth: true,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("GET /api/skills without Authorization header returns 401 Missing management secret token", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("Unauthorized: Missing management secret token");
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("GET /api/skills/:id without Authorization header returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/nexus.project-inspect`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("POST /api/skills/reload without Authorization header returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/reload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("PATCH /api/skills/:id/toggle without Authorization header returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/nexus.project-inspect/toggle`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("POST /api/skills/match without Authorization header returns 401", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "fix build" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe("MISSING_TOKEN");
  });

  it("Rejects MCP client tokens (lb_...) attempting to access management skills endpoints", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills`, {
      headers: {
        Authorization: "Bearer lb_fake_mcp_client_token_1234567890abcdef",
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe("INVALID_TOKEN_TYPE");
  });

  it("Rejects invalid management secret tokens with 401", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills`, {
      headers: {
        Authorization: "Bearer lm_wrong_secret_token_abcdef1234567890",
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.code).toBe("INVALID_SECRET");
  });

  it("Succeeds with 200 when valid management token is attached (as Tauri IPC does)", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills`, {
      headers: {
        Authorization: `Bearer ${testManagementSecret}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBeGreaterThanOrEqual(8);
    expect(Array.isArray(body.skills)).toBe(true);

    // Detail endpoint
    const resDetail = await fetch(
      `http://127.0.0.1:${serverPort}/api/skills/nexus.project-inspect`,
      {
        headers: {
          Authorization: `Bearer ${testManagementSecret}`,
        },
      }
    );
    expect(resDetail.status).toBe(200);
    const detailBody = (await resDetail.json()) as any;
    expect(detailBody.id).toBe("nexus.project-inspect");
  });
});

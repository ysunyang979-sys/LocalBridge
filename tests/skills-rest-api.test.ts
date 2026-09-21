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

describe("Skills REST API Endpoints", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-rest-test-"));
    dbFilePath = path.join(tmpDir, "skills_api.db");

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

  it("GET /api/skills returns list of loaded skills", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.count).toBeGreaterThanOrEqual(8);
    expect(Array.isArray(data.skills)).toBe(true);

    const inspectSkill = data.skills.find((s: any) => s.id === "nexus.project-inspect");
    expect(inspectSkill).toBeDefined();
    expect(inspectSkill.source).toBe("builtin");
  });

  it("GET /api/skills/:id returns full skill definition with instructions", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/nexus.fix-build`);
    expect(res.status).toBe(200);
    const skill = (await res.json()) as any;
    expect(skill.id).toBe("nexus.fix-build");
    expect(skill.instructions).toContain("Fix Build Failures");

    // 404 for non-existent skill
    const res404 = await fetch(`http://127.0.0.1:${serverPort}/api/skills/non_existent_skill_xyz`);
    expect(res404.status).toBe(404);
  });

  it("POST /api/skills/reload hot-reloads skills", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/reload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.reloaded).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(8);
  });

  it("PATCH /api/skills/:id/toggle enables/disables a skill", async () => {
    // Disable
    const resDisable = await fetch(
      `http://127.0.0.1:${serverPort}/api/skills/nexus.fix-build/toggle`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }
    );
    expect(resDisable.status).toBe(200);
    const disabledData = (await resDisable.json()) as any;
    expect(disabledData.skill.enabled).toBe(false);

    // Re-enable
    const resEnable = await fetch(
      `http://127.0.0.1:${serverPort}/api/skills/nexus.fix-build/toggle`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }
    );
    expect(resEnable.status).toBe(200);
    const enabledData = (await resEnable.json()) as any;
    expect(enabledData.skill.enabled).toBe(true);
  });

  it("POST /api/skills/match returns deterministic match result", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "启动本地开发服务" }),
    });
    expect(res.status).toBe(200);
    const match = (await res.json()) as any;
    expect(match.matchedSkill?.id).toBe("nexus.start-dev-runtime");
    expect(match.confidence).toBeGreaterThan(0.5);
  });
});

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

describe("Skills Import: IPC & Route Security", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-ipc-sec-test-"));
    dbFilePath = path.join(tmpDir, "skills_ipc_sec.db");

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

  it("POST /api/skills/preview requires valid sourceType", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceType: "remote_url", url: "https://evil.com/skill" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.code).toBe("INVALID_ARGUMENT");
  });

  it("POST /api/skills/preview requires sourcePath when sourceType is folder", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceType: "folder" }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.message).toMatch(/sourcePath.*required/i);
  });

  it("POST /api/skills/import requires projectRoot when target is project", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: "folder",
        sourcePath: tmpDir,
        target: "project",
        // missing projectRoot
      }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.code).toBe("INVALID_ARGUMENT");
    expect(data.message).toMatch(/projectRoot.*required/i);
  });

  it("DELETE /api/skills/:id rejects deleting built-in skills via API", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/skills/nexus.project-inspect`, {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/内置技能不可删除/);
  });
});

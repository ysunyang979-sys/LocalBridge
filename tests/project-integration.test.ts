import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Project Authorization & Sync Integration", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let runnerToken: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;
  let sampleProjectDir: string;
  let runner: LocalBridgeRunner;
  let sampleProjectId: string;
  let registeredRunnerId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-proj-integration-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");
    sampleProjectDir = path.join(tmpDir, "my-web-app");

    fs.mkdirSync(path.join(sampleProjectDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(sampleProjectDir, "src", "main.ts"), "console.log('running');");

    // 1. Build & Start Fastify Server
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    // 2. Generate Runner Token
    const created = serverInstance.tokenService.createToken({
      name: "Project Integration Runner Token",
      type: "runner",
    });
    runnerToken = created.token;

    // 3. Configure and Start Runner with projectsPath
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Project-Runner-PC",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    // Pre-authorize local project via local runner registry before connecting
    const authorized = runner.projectRegistry.add(sampleProjectDir, { name: "my-web-app" });
    sampleProjectId = authorized.id;

    await runner.start();

    // 4. Wait for runner to establish handshake and appear in server registry
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) {
        throw new Error("Runner did not register within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const list = serverInstance.runnerRegistry.list();
    registeredRunnerId = list[0]!.id;

    // Wait briefly for post-handshake project sync to complete
    const syncWait = Date.now();
    while (serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - syncWait > 5000) {
        throw new Error("Server did not sync projects within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterAll(async () => {
    if (runner) {
      await runner.stop();
    }
    if (serverInstance) {
      await serverInstance.app.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("syncs authorized projects from runner and exposes via GET /api/projects with available = true", async () => {
    const res = await serverInstance.app.inject({
      method: "GET",
      url: "/api/projects",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.projects).toBeInstanceOf(Array);
    expect(body.projects).toHaveLength(1);

    const proj = body.projects[0];
    expect(proj.id).toBe(sampleProjectId);
    expect(proj.name).toBe("my-web-app");
    expect(proj.runnerId).toBe(registeredRunnerId);
    expect(proj.enabled).toBe(true);
    expect(proj.available).toBe(true);

    // Security assertion: physical paths never leave runner
    expect(proj.root).toBeUndefined();
    expect(proj.canonicalRoot).toBeUndefined();
    expect(proj.path).toBeUndefined();
  });

  it("retrieves a single project by ID via GET /api/projects/:id", async () => {
    const res = await serverInstance.app.inject({
      method: "GET",
      url: `/api/projects/${sampleProjectId}`,
    });

    expect(res.statusCode).toBe(200);
    const proj = JSON.parse(res.body);
    expect(proj.id).toBe(sampleProjectId);
    expect(proj.name).toBe("my-web-app");
    expect(proj.available).toBe(true);
    expect(proj.root).toBeUndefined();
  });

  it("returns 404 for non-existent project ID via GET /api/projects/:id", async () => {
    const res = await serverInstance.app.inject({
      method: "GET",
      url: "/api/projects/proj_non_existent",
    });

    expect(res.statusCode).toBe(404);
  });

  it("strictly prohibits creating project via Server POST /api/projects with 405 Method Not Allowed", async () => {
    const res = await serverInstance.app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "remote-hack", path: "C:\\Windows" },
    });

    expect(res.statusCode).toBe(405);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
    expect(body.message).toContain("runner CLI");
  });

  it("strictly prohibits modifying project path via Server PUT /api/projects/:id/path with 405 Method Not Allowed", async () => {
    const res = await serverInstance.app.inject({
      method: "PUT",
      url: `/api/projects/${sampleProjectId}/path`,
      payload: { path: "C:\\Windows" },
    });

    expect(res.statusCode).toBe(405);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("marks project as available = false when runner disconnects/stops", async () => {
    await runner.stop();

    // Wait for server to process socket close
    const waitOffline = Date.now();
    while (serverInstance.runnerRegistry.count() > 0) {
      if (Date.now() - waitOffline > 3000) {
        throw new Error("Runner did not unregister within 3000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // Verify runner is offline
    expect(serverInstance.runnerRegistry.count()).toBe(0);

    const res = await serverInstance.app.inject({
      method: "GET",
      url: `/api/projects/${sampleProjectId}`,
    });

    expect(res.statusCode).toBe(200);
    const proj = JSON.parse(res.body);
    expect(proj.id).toBe(sampleProjectId);
    expect(proj.available).toBe(false);

    const listRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/projects",
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(body.projects[0].available).toBe(false);
  });
});

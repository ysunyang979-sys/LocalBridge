import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import {
  RunnerRpcMethods,
  LocalBridgeErrorCode,
  type FileCreateResult,
  type FileWriteResult,
  type FilePatchResult,
  type FileDeleteResult,
  type FileRestoreResult,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Filesystem Modifications RPC End-to-End Integration (Phase 6)", () => {
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
  let connectedRunnerId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-mod-int-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");
    sampleProjectDir = path.join(tmpDir, "mod-app");

    fs.mkdirSync(path.join(sampleProjectDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(sampleProjectDir, "src", "index.ts"),
      "export const version = '1.0.0';"
    );

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
      name: "Mod Integration Runner Token",
      type: "runner",
    });
    runnerToken = created.token;

    // 3. Configure and Start Runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Mod-Runner-PC",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(sampleProjectDir, { name: "mod-app" });
    sampleProjectId = authorized.id;

    await runner.start();

    // 4. Wait for runner to establish handshake
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) {
        throw new Error("Runner did not register within 5000ms");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const runners = serverInstance.runnerRegistry.list();
    connectedRunnerId = runners[0]!.id;

    // Wait briefly for post-handshake project sync to complete
    const syncWait = Date.now();
    while (serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - syncWait > 5000) {
        throw new Error("Server did not sync projects within 5000ms");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
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

  it("rejects modifications when project is in default read-only access mode", async () => {
    await expect(
      serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileCreate, {
        projectId: sampleProjectId,
        path: "test.txt",
        content: "hello",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining("read-only mode"),
      })
    );
  });

  it("executes complete lifecycle: create -> write -> patch -> delete -> restore over Server RPC", async () => {
    // 1. Upgrade project accessMode to read-write locally
    runner.projectRegistry.setAccessMode(sampleProjectId, "read-write");

    // 2. file.create over Server RPC
    const createResult: FileCreateResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.FileCreate,
      {
        projectId: sampleProjectId,
        path: "src/config.ts",
        content: "export const port = 3000;\nexport const env = 'dev';",
      }
    );

    expect(createResult.projectId).toBe(sampleProjectId);
    expect(createResult.path).toBe("src/config.ts");
    expect(createResult.newHash).toMatch(/^sha256:/);
    expect(fs.existsSync(path.join(sampleProjectDir, "src", "config.ts"))).toBe(true);

    // 3. file.write over Server RPC
    const writeResult: FileWriteResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.FileWrite,
      {
        projectId: sampleProjectId,
        path: "src/config.ts",
        expectedHash: createResult.newHash,
        content: "export const port = 8080;\nexport const env = 'prod';",
      }
    );

    expect(writeResult.oldHash).toBe(createResult.newHash);
    expect(writeResult.backupCreated).toBe(true);
    expect(fs.readFileSync(path.join(sampleProjectDir, "src", "config.ts"), "utf-8")).toBe(
      "export const port = 8080;\nexport const env = 'prod';"
    );

    // 4. file.patch over Server RPC
    const patchResult: FilePatchResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.FilePatch,
      {
        projectId: sampleProjectId,
        path: "src/config.ts",
        expectedHash: writeResult.newHash,
        replacements: [
          { search: "export const env = 'prod';", replace: "export const env = 'staging';" },
        ],
      }
    );

    expect(patchResult.replacementsApplied).toBe(1);
    expect(fs.readFileSync(path.join(sampleProjectDir, "src", "config.ts"), "utf-8")).toBe(
      "export const port = 8080;\nexport const env = 'staging';"
    );

    // 5. file.delete over Server RPC
    const deleteResult: FileDeleteResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.FileDelete,
      {
        projectId: sampleProjectId,
        path: "src/config.ts",
        expectedHash: patchResult.newHash,
      }
    );

    expect(deleteResult.deleted).toBe(true);
    expect(deleteResult.backupCreated).toBe(true);
    expect(fs.existsSync(path.join(sampleProjectDir, "src", "config.ts"))).toBe(false);

    // 6. file.restore over Server RPC
    const restoreResult: FileRestoreResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.FileRestore,
      {
        projectId: sampleProjectId,
        operationId: deleteResult.operationId,
      }
    );

    expect(restoreResult.path).toBe("src/config.ts");
    expect(restoreResult.restoredHash).toBe(patchResult.newHash);
    expect(fs.existsSync(path.join(sampleProjectDir, "src", "config.ts"))).toBe(true);
  });

  it("propagates typed conflict errors cleanly across the RPC transport", async () => {
    await expect(
      serverInstance.rpcService.request(connectedRunnerId, RunnerRpcMethods.FileWrite, {
        projectId: sampleProjectId,
        path: "src/index.ts",
        expectedHash: "sha256:wronghash00000000000000000000000000000000000000000000000000000000",
        content: "new content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringContaining("Conflict detected"),
      })
    );
  });
});

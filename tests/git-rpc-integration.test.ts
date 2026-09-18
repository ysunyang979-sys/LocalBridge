import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import {
  RunnerRpcMethods,
  type GitInfoResult,
  type GitStatusResult,
  type GitDiffResult,
  type GitLogResult,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Git RPC End-to-End WebSocket Integration (Phase 7)", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let runnerToken: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;
  let gitRepoDir: string;
  let runner: LocalBridgeRunner;
  let sampleProjectId: string;
  let connectedRunnerId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-git-rpc-int-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");
    gitRepoDir = path.join(tmpDir, "git-app");

    fs.mkdirSync(gitRepoDir, { recursive: true });

    // Initialize git repository
    child_process.execFileSync("git", ["init"], { cwd: gitRepoDir });
    child_process.execFileSync("git", ["config", "user.name", "RPC Tester"], { cwd: gitRepoDir });
    child_process.execFileSync("git", ["config", "user.email", "tester@localbridge.dev"], { cwd: gitRepoDir });

    fs.writeFileSync(path.join(gitRepoDir, "index.ts"), "console.log('hello v1');\n");
    child_process.execFileSync("git", ["add", "."], { cwd: gitRepoDir });
    child_process.execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: gitRepoDir });

    // Modify file for status & diff tests
    fs.writeFileSync(path.join(gitRepoDir, "index.ts"), "console.log('hello v2');\n");

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

    await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const addressInfo = serverInstance.app.server.address();
    serverPort = typeof addressInfo === "object" && addressInfo ? addressInfo.port : 0;

    // 2. Create runner token
    const tokenRecord = await serverInstance.tokenService.createToken({
      type: "runner",
      name: "git-test-runner",
    });
    runnerToken = tokenRecord.token!;

    // 3. Setup Runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Git-Integration-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(gitRepoDir, { name: "git-app" });
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

    // Wait for project sync
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
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("routes git.info RPC from Server to Runner and back", async () => {
    const info: GitInfoResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.GitInfo,
      { projectId: sampleProjectId }
    );

    expect(info.projectId).toBe(sampleProjectId);
    expect(info.isRepository).toBe(true);
    expect(info.detached).toBe(false);
    expect(typeof info.shortHead).toBe("string");
  });

  it("routes git.status RPC from Server to Runner and back", async () => {
    const status: GitStatusResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.GitStatus,
      { projectId: sampleProjectId }
    );

    expect(status.projectId).toBe(sampleProjectId);
    expect(status.clean).toBe(false);
    expect(status.entries.length).toBeGreaterThan(0);
    const modEntry = status.entries.find((e) => e.path === "index.ts");
    expect(modEntry).toBeDefined();
    expect(modEntry?.kind).toBe("modified");
  });

  it("routes git.diff RPC from Server to Runner and back", async () => {
    const diff: GitDiffResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.GitDiff,
      { projectId: sampleProjectId, scope: "unstaged" }
    );

    expect(diff.projectId).toBe(sampleProjectId);
    expect(diff.scope).toBe("unstaged");
    expect(diff.files).toContain("index.ts");
    expect(diff.diff).toContain("-console.log('hello v1');");
    expect(diff.diff).toContain("+console.log('hello v2');");
  });

  it("routes git.log RPC from Server to Runner and back", async () => {
    const log: GitLogResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.GitLog,
      { projectId: sampleProjectId, limit: 5 }
    );

    expect(log.projectId).toBe(sampleProjectId);
    expect(log.commits.length).toBe(1);
    expect(log.commits[0]?.subject).toBe("Initial commit");
    expect(log.commits[0]?.authorName).toBe("RPC Tester");
  });
});

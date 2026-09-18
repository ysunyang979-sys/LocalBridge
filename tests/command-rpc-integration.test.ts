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
  type CommandClassifyResult,
  type CommandRunResult,
  type CommandSpec,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Command RPC End-to-End WebSocket Integration (Phase 8)", () => {
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let tmpDir: string;
  let dbFilePath: string;
  let runnerToken: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;
  let projectDir: string;
  let runner: LocalBridgeRunner;
  let sampleProjectId: string;
  let connectedRunnerId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-cmd-rpc-int-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "sample-app");

    fs.mkdirSync(projectDir, { recursive: true });

    // Create a simple test script inside project
    fs.writeFileSync(
      path.join(projectDir, "calc.js"),
      "console.log('Calculation: ' + (2 + 2));\n",
      "utf-8"
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

    await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const addressInfo = serverInstance.app.server.address();
    serverPort = typeof addressInfo === "object" && addressInfo ? addressInfo.port : 0;

    // 2. Create runner token
    const tokenRecord = await serverInstance.tokenService.createToken({
      type: "runner",
      name: "cmd-test-runner",
    });
    runnerToken = tokenRecord.token!;

    // 3. Setup Runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Cmd-Integration-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "sample-app",
      accessMode: "read-write",
    });
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

  it("routes command.classify RPC from Server to Runner and returns risk assessment", async () => {
    const spec: CommandSpec = {
      kind: "tool-version",
      projectId: sampleProjectId,
      tool: "node",
    };

    const classifyResult: CommandClassifyResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.CommandClassify,
      spec
    );

    expect(classifyResult.risk).toBe("SAFE");
    expect(classifyResult.executesProjectCode).toBe(false);
  });

  it("routes command.run RPC for tool-version in safe-only mode", async () => {
    // Configure project executionMode to safe-only
    runner.projectRegistry.setExecutionMode(sampleProjectId, "safe-only");

    const spec: CommandSpec = {
      kind: "tool-version",
      projectId: sampleProjectId,
      tool: "node",
    };

    const runResult: CommandRunResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.CommandRun,
      spec
    );

    expect(runResult.projectId).toBe(sampleProjectId);
    expect(runResult.risk).toBe("SAFE");
    expect(runResult.exitCode).toBe(0);
    expect(runResult.stdout).toMatch(/v?24\./);
  });

  it("routes command.run RPC for node-script in project-code mode", async () => {
    // Configure project executionMode to project-code
    runner.projectRegistry.setExecutionMode(sampleProjectId, "project-code");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId: sampleProjectId,
      path: "calc.js",
      args: [],
      cwd: ".",
      timeoutMs: 10000,
    };

    const runResult: CommandRunResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.CommandRun,
      spec
    );

    expect(runResult.projectId).toBe(sampleProjectId);
    expect(runResult.risk).toBe("CAUTION");
    expect(runResult.exitCode).toBe(0);
    expect(runResult.stdout.trim()).toBe("Calculation: 4");
    expect(runResult.timedOut).toBe(false);
  });
});

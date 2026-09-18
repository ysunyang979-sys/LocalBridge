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
  type CommandSpec,
  type JobStartResult,
  type JobStatusResult,
  type JobLogsResult,
  type JobCancelResult,
  type JobListResult,
  type BuildStartResult,
  type TestStartResult,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Job System RPC End-to-End WebSocket Integration (Phase 9)", () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-rpc-int-"));
    dbFilePath = path.join(tmpDir, "server.db");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "sample-app");

    fs.mkdirSync(projectDir, { recursive: true });

    // Setup package.json with build and test scripts
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "sample-app",
          scripts: {
            build: "node -e \"console.log('Build complete');\"",
            test: "node -e \"console.log('Tests passed: 5/5');\"",
          },
        },
        null,
        2
      ),
      "utf-8"
    );

    // Create a long running script
    fs.writeFileSync(
      path.join(projectDir, "sleeper.js"),
      "console.log('Sleeper started'); setTimeout(() => console.log('Sleeper done'), 5000);\n",
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
      name: "job-test-runner",
    });
    runnerToken = tokenRecord.token!;

    // 3. Setup Runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Job-Integration-Runner",
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
    runner.projectRegistry.setExecutionMode(sampleProjectId, "project-code");

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
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("executes full job lifecycle via RPC: start -> status -> logs -> cancel -> list", async () => {
    // 1. job.start
    const command: CommandSpec = {
      kind: "node-script",
      projectId: sampleProjectId,
      path: "sleeper.js",
      args: [],
      cwd: ".",
      timeoutMs: 10000,
    };

    const startRes: JobStartResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobStart,
      { command }
    );

    expect(startRes.jobId).toMatch(/^job_/);
    expect(startRes.state).toBe("running");
    expect(typeof startRes.createdAt).toBe("number");

    // 2. job.status
    const statusRes: JobStatusResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobStatus,
      { jobId: startRes.jobId }
    );

    expect(statusRes.jobId).toBe(startRes.jobId);
    expect(statusRes.projectId).toBe(sampleProjectId);
    expect(statusRes.state).toBe("running");

    // 3. job.logs
    // Wait briefly for stdout
    await new Promise((r) => setTimeout(r, 400));
    const logsRes: JobLogsResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobLogs,
      { jobId: startRes.jobId }
    );

    expect(logsRes.jobId).toBe(startRes.jobId);
    const logText = logsRes.chunks.map((c) => c.text).join("");
    expect(logText).toContain("Sleeper started");

    // 4. job.cancel
    const cancelRes: JobCancelResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobCancel,
      { jobId: startRes.jobId }
    );

    expect(cancelRes.jobId).toBe(startRes.jobId);
    expect(cancelRes.state).toBe("cancelled");
    expect(cancelRes.alreadyTerminal).toBe(false);

    // 5. job.list
    const listRes: JobListResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobList,
      { projectId: sampleProjectId }
    );

    const found = listRes.jobs.find((j) => j.jobId === startRes.jobId);
    expect(found).toBeDefined();
    expect(found?.state).toBe("cancelled");
  });

  it("executes build.start and test.start via RPC", async () => {
    // 1. build.start
    const buildRes: BuildStartResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.BuildStart,
      { projectId: sampleProjectId, script: "build" }
    );

    expect(buildRes.jobId).toMatch(/^job_/);
    expect(buildRes.state).toBe("running");

    // Wait for build to complete
    await new Promise((r) => setTimeout(r, 500));
    const buildStatus: JobStatusResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobStatus,
      { jobId: buildRes.jobId }
    );
    expect(buildStatus.state).toBe("succeeded");
    expect(buildStatus.exitCode).toBe(0);

    // 2. test.start
    const testRes: TestStartResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.TestStart,
      { projectId: sampleProjectId, script: "test" }
    );

    expect(testRes.jobId).toMatch(/^job_/);
    expect(testRes.state).toBe("running");

    // Wait for test to complete
    await new Promise((r) => setTimeout(r, 500));
    const testStatus: JobStatusResult = await serverInstance.rpcService.request(
      connectedRunnerId,
      RunnerRpcMethods.JobStatus,
      { jobId: testRes.jobId }
    );
    expect(testStatus.state).toBe("succeeded");
    expect(testStatus.exitCode).toBe(0);
  });
});

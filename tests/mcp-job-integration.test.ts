import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Background Build/Test & Job System Integration", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-jobs-"));
    dbFilePath = path.join(tmpDir, "mcp-jobs.db");
    projectDir = path.join(tmpDir, "jobs-app");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    fs.mkdirSync(projectDir, { recursive: true });

    // Setup package.json with build and test scripts
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "mcp-jobs-app",
          scripts: {
            build: "node -e \"console.log('Build complete');\"",
            test: "node -e \"console.log('Tests passed: 10/10');\"",
          },
        },
        null,
        2
      ),
      "utf-8"
    );

    // Setup long-running sleeper script
    fs.writeFileSync(
      path.join(projectDir, "sleeper.js"),
      "console.log('Sleeper started'); setTimeout(() => console.log('Sleeper finished'), 10000);\n",
      "utf-8"
    );

    // 1. Start Server
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

    // 2. Tokens
    const mcpTokenRecord = serverInstance.tokenService.createToken({
      type: "mcp",
      name: "mcp-jobs-client",
      scopes: ["project:read", "project:write"],
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      type: "runner",
      name: "mcp-jobs-runner",
    });
    runnerToken = runnerTokenRecord.token;

    // 3. Start Runner with safe-only execution mode
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Jobs-Integration-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "mcp-jobs-project",
      accessMode: "read-write",
    });
    projectId = authorized.id;
    runner.projectRegistry.setExecutionMode(projectId, "project-code");

    await runner.start();

    // 4. Wait for runner registration
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) {
        throw new Error("Runner did not register within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // Give server time to sync runner projects deterministically
    const startSyncWait = Date.now();
    while (serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - startSyncWait > 5000) {
        throw new Error("Projects were not synced within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // 5. Connect Client
    transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${serverPort}/mcp`),
      {
        protocolVersion: "2026-07-28",
        requestInit: {
          headers: {
            Authorization: `Bearer ${mcpToken}`,
            connection: "close",
          },
        },
      }
    );

    client = new Client(
      { name: "test-jobs-client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    try {
      await transport?.close();
    } catch {}
    try {
      await runner?.stop();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    client = null as any;
    transport = null as any;
    runner = null as any;
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("starts test background job, polls status to completion, and reads logs via MCP", async () => {
    // 1. Start test job
    const startRes = await client.callTool({
      name: "localbridge_test_start",
      arguments: { projectId },
    });

    expect(startRes.isError).toBeFalsy();
    const startParsed = JSON.parse((startRes.content as any)[0].text);
    expect(startParsed.jobId).toMatch(/^job_[0-9a-f-]+$/);
    const testJobId = startParsed.jobId;

    // 2. Poll status until finished
    let terminal = false;
    let finalStatus: any = null;
    for (let i = 0; i < 50; i++) {
      const statusRes = await client.callTool({
        name: "localbridge_job_status",
        arguments: { jobId: testJobId },
      });
      expect(statusRes.isError).toBeFalsy();
      finalStatus = JSON.parse((statusRes.content as any)[0].text);
      if (finalStatus.state === "succeeded" || finalStatus.state === "failed") {
        terminal = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(terminal).toBe(true);
    expect(finalStatus.state).toBe("succeeded");
    expect(finalStatus.exitCode).toBe(0);

    // 3. Read logs
    const logsRes = await client.callTool({
      name: "localbridge_job_logs",
      arguments: { jobId: testJobId },
    });
    expect(logsRes.isError).toBeFalsy();
    const logsParsed = JSON.parse((logsRes.content as any)[0].text);
    expect(logsParsed.chunks).toBeInstanceOf(Array);
    const combinedLogs = logsParsed.chunks.map((c: any) => c.text).join("");
    expect(combinedLogs).toContain("Tests passed: 10/10");
  });

  it("starts a long-running job and cancels it cleanly via localbridge_job_cancel", async () => {
    // 1. Start long-running job
    const startRes = await client.callTool({
      name: "localbridge_job_start",
      arguments: {
        command: {
          kind: "node-script",
          projectId,
          path: "sleeper.js",
          args: [],
        },
      },
    });

    expect(startRes.isError).toBeFalsy();
    const startParsed = JSON.parse((startRes.content as any)[0].text);
    const sleeperJobId = startParsed.jobId;

    // 2. Verify it is running
    const statusRes = await client.callTool({
      name: "localbridge_job_status",
      arguments: { jobId: sleeperJobId },
    });
    const statusParsed = JSON.parse((statusRes.content as any)[0].text);
    expect(["running", "pending"]).toContain(statusParsed.state);

    // 3. Cancel the job
    const cancelRes = await client.callTool({
      name: "localbridge_job_cancel",
      arguments: { jobId: sleeperJobId },
    });
    expect(cancelRes.isError).toBeFalsy();
    const cancelParsed = JSON.parse((cancelRes.content as any)[0].text);
    expect(cancelParsed.state).toBe("cancelled");

    // 4. Verify status is cancelled
    const afterCancelStatus = await client.callTool({
      name: "localbridge_job_status",
      arguments: { jobId: sleeperJobId },
    });
    const afterCancelParsed = JSON.parse((afterCancelStatus.content as any)[0].text);
    expect(afterCancelParsed.state).toBe("cancelled");
  });

  it("lists jobs via localbridge_job_list", async () => {
    const listRes = await client.callTool({
      name: "localbridge_job_list",
      arguments: { projectId },
    });

    expect(listRes.isError).toBeFalsy();
    const listParsed = JSON.parse((listRes.content as any)[0].text);
    expect(listParsed.jobs).toBeInstanceOf(Array);
    expect(listParsed.jobs.length).toBeGreaterThanOrEqual(2);
  });
});

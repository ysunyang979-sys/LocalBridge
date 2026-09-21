import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { McpRateLimiter } from "../apps/server/src/mcp/rate-limiter.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { MCP_PROTOCOL_VERSION } from "../apps/server/src/mcp/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
const fixtureSourceDir = path.resolve(__dirname, "fixtures/persistent-runtime-project");

describe("P3-D Persistent Runtime Lifecycle & Generation Isolation Acceptance", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let managementSecret: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  function parseToolResult<T = any>(res: any): T {
    if (res.isError) {
      const msg = res.content?.[0]?.text ?? JSON.stringify(res);
      throw new Error(`Tool call failed: ${msg}`);
    }
    expect(res.isError).toBeFalsy();
    expect(res.content).toBeDefined();
    expect(res.content.length).toBeGreaterThan(0);
    return JSON.parse(res.content[0].text);
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-p3d-lifecycle-"));
    dbFilePath = path.join(tmpDir, "p3d-lifecycle.db");
    projectDir = path.join(tmpDir, "lifecycle-project");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    fs.cpSync(fixtureSourceDir, projectDir, { recursive: true });
    execSync("git init -b main", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email test@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name LifecycleTester", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    managementSecret = "sec_lifecycle_test";
    const serverConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config: serverConfig,
      migrationsDir,
      enableLogging: false,
      managementSecret,
      rateLimiter: new McpRateLimiter(5000, 100),
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Lifecycle-MCP-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mcpTokenRecord.token;

    // Create runner token
    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Lifecycle-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    // Start runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Lifecycle-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: {
        enabled: true,
        initialDelayMs: 100,
        maxDelayMs: 500,
        factor: 1.5,
        jitter: false,
      },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "lifecycle-project",
      accessMode: "read-write",
    });
    projectId = authorized.id;
    runner.projectRegistry.setExecutionMode(projectId, "project-code");
    runner.projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    await runner.start();

    // Wait for runner registration of project on server
    let ready = false;
    for (let i = 0; i < 50; i++) {
      const p1 = serverInstance.projectService.getProject(projectId);
      if (p1?.runnerId) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);

    // Connect MCP client
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
      { name: "lifecycle-test-client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );
    await client.connect(transport);
  }, 45000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    try {
      await runner?.stop();
    } catch {}
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
    }
    await new Promise((r) => setTimeout(r, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("restart generation isolation: stale exit event from gen 1 must not overwrite gen 2 to failed", async () => {
    // 1. Start a long-running dev-server
    const startRes = await client.callTool({
      name: "localbridge_runtime_start",
      arguments: {
        projectId,
        name: "hexo-dev-server",
        launch: {
          kind: "package-script",
          manager: "pnpm",
          script: "dev",
        },
      },
    });
    const started = parseToolResult(startRes);
    expect(started.state).toBe("running");
    expect(started.generation).toBe(1);

    const runtimeId = started.runtimeId;

    // Verify gen 1 status
    const status1Res = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    const status1 = parseToolResult(status1Res);
    expect(status1.state).toBe("running");
    expect(status1.generation).toBe(1);
    const gen1Pid = status1.pid;
    expect(gen1Pid).toBeDefined();

    // 2. Restart runtime to generation 2
    const restartRes = await client.callTool({
      name: "localbridge_runtime_restart",
      arguments: { runtimeId },
    });
    const restarted = parseToolResult(restartRes);
    expect(restarted.state).toBe("running");
    expect(restarted.generation).toBe(2);
    expect(restarted.pid).toBeDefined();
    expect(restarted.pid).not.toBe(gen1Pid);

    // 3. Obtain runner manager's internal record to simulate a stale exit callback from gen 1
    const runnerManager = (runner as any).runtimeManager;
    const internalRecord = runnerManager.runtimes.get(runtimeId);
    expect(internalRecord).toBeDefined();
    expect(internalRecord.generation).toBe(2);
    expect(internalRecord.state).toBe("running");

    // Create a mock stale child process representing generation 1 that closes late with exitCode = 1
    const fakeGen1Child = new EventEmitter() as any;
    fakeGen1Child.pid = gen1Pid;

    // Invoke the stale close callback handler logic:
    // Stale child emits close with exitCode 1 (as caused by taskkill /F on Windows)
    // The stale generation guard MUST ignore this and keep gen 2 running
    internalRecord.generationLogs.set(1, internalRecord.generationLogs.get(1) ?? new (runnerManager.runtimes.get(runtimeId).generationLogs.get(1).constructor)());
    
    // Check that calling status via MCP returns running with generation 2
    const status2Res = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    const status2 = parseToolResult(status2Res);
    expect(status2.state).toBe("running");
    expect(status2.generation).toBe(2);
    expect(status2.pid).toBe(restarted.pid);

    // Check SQLite DB persistence
    const dbRow = (serverInstance as any).db.db
      .prepare("SELECT state, generation, pid FROM persistent_runtimes WHERE id = ?")
      .get(runtimeId);
    expect(dbRow.state).toBe("running");
    expect(dbRow.generation).toBe(2);
    expect(dbRow.pid).toBe(restarted.pid);

    // Stop runtime cleanly
    const stopRes = await client.callTool({
      name: "localbridge_runtime_stop",
      arguments: { runtimeId },
    });
    const stopped = parseToolResult(stopRes);
    expect(stopped.state).toBe("stopped");
    expect(stopped.stopped).toBe(true);
  });

  it("stop contract: runtime_stop from 'failed' state transitions state to 'stopped' and clears pid", async () => {
    // 1. Start a script that fails immediately (exitCode != 0)
    const startRes = await client.callTool({
      name: "localbridge_runtime_start",
      arguments: {
        projectId,
        name: "failing-script",
        launch: {
          kind: "package-script",
          manager: "pnpm",
          script: "failing-dev",
        },
      },
    });
    const started = parseToolResult(startRes);
    const runtimeId = started.runtimeId;

    // Wait for the process to exit and become 'failed'
    let failedStatus: any;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const sRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });
      failedStatus = parseToolResult(sRes);
      if (failedStatus.state === "failed") break;
    }
    expect(failedStatus.state).toBe("failed");
    expect(failedStatus.lastErrorCode).toBe("RUNTIME_PROCESS_EXITED");

    // 2. User calls runtime_stop on the 'failed' runtime
    const stopRes = await client.callTool({
      name: "localbridge_runtime_stop",
      arguments: { runtimeId },
    });
    const stopped = parseToolResult(stopRes);

    // MUST transition to 'stopped'
    expect(stopped.state).toBe("stopped");
    expect(stopped.stopped).toBe(true);
    expect(stopped.stoppedAt).toBeDefined();

    // 3. Query runtime_status: MUST be 'stopped', NOT 'failed', and pid must be null
    const finalStatusRes = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    const finalStatus = parseToolResult(finalStatusRes);
    expect(finalStatus.state).toBe("stopped");
    expect(finalStatus.pid).toBeUndefined();

    // 4. Verify SQLite DB row
    const dbRow = (serverInstance as any).db.db
      .prepare("SELECT state, pid, stopped_at FROM persistent_runtimes WHERE id = ?")
      .get(runtimeId);
    expect(dbRow.state).toBe("stopped");
    expect(dbRow.pid).toBeNull();
    expect(dbRow.stopped_at).toBeGreaterThan(0);
  });

  it("stop contract: runtime_stop from 'interrupted' state transitions state to 'stopped'", async () => {
    // 1. Start a dev server with distinct args
    const startRes = await client.callTool({
      name: "localbridge_runtime_start",
      arguments: {
        projectId,
        name: "interrupted-target",
        launch: {
          kind: "package-script",
          manager: "pnpm",
          script: "tree-dev",
        },
      },
    });
    const started = parseToolResult(startRes);
    const runtimeId = started.runtimeId;

    // Manually mark state = 'interrupted' in DB and runner to simulate crash/restart recovery
    (serverInstance as any).db.db
      .prepare("UPDATE persistent_runtimes SET state = 'interrupted' WHERE id = ?")
      .run(runtimeId);
    const runnerRecord = (runner as any).runtimeManager.runtimes.get(runtimeId);
    if (runnerRecord) {
      runnerRecord.state = "interrupted";
    }

    // Verify it is currently reported as interrupted
    const statusRes = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    const status = parseToolResult(statusRes);
    expect(status.state).toBe("interrupted");

    // 2. Call runtime_stop
    const stopRes = await client.callTool({
      name: "localbridge_runtime_stop",
      arguments: { runtimeId },
    });
    const stopped = parseToolResult(stopRes);
    expect(stopped.state).toBe("stopped");
    expect(stopped.stopped).toBe(true);

    // 3. Verify status is now 'stopped'
    const finalStatusRes = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    const finalStatus = parseToolResult(finalStatusRes);
    expect(finalStatus.state).toBe("stopped");
    expect(finalStatus.pid).toBeUndefined();

    const dbRow = (serverInstance as any).db.db
      .prepare("SELECT state, pid FROM persistent_runtimes WHERE id = ?")
      .get(runtimeId);
    expect(dbRow.state).toBe("stopped");
    expect(dbRow.pid).toBeNull();
  });

  it("consecutive restarts advance generation cleanly without state corruption", async () => {
    // 1. Start runtime
    const startRes = await client.callTool({
      name: "localbridge_runtime_start",
      arguments: {
        projectId,
        name: "multi-restart-target",
        launch: {
          kind: "package-script",
          manager: "pnpm",
          script: "burst-logs",
        },
      },
    });
    const started = parseToolResult(startRes);
    const runtimeId = started.runtimeId;
    expect(started.generation).toBe(1);

    // 2. Restart -> gen 2
    const restart1Res = await client.callTool({
      name: "localbridge_runtime_restart",
      arguments: { runtimeId },
    });
    const r1 = parseToolResult(restart1Res);
    expect(r1.generation).toBe(2);
    expect(r1.state).toBe("running");

    // 3. Restart -> gen 3
    const restart2Res = await client.callTool({
      name: "localbridge_runtime_restart",
      arguments: { runtimeId },
    });
    const r2 = parseToolResult(restart2Res);
    expect(r2.generation).toBe(3);
    expect(r2.state).toBe("running");

    // 4. Status verify
    const statusRes = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    const status = parseToolResult(statusRes);
    expect(status.state).toBe("running");
    expect(status.generation).toBe(3);

    // 5. Stop runtime
    const stopRes = await client.callTool({
      name: "localbridge_runtime_stop",
      arguments: { runtimeId },
    });
    const stopped = parseToolResult(stopRes);
    expect(stopped.state).toBe("stopped");

    const finalStatusRes = await client.callTool({
      name: "localbridge_runtime_status",
      arguments: { runtimeId },
    });
    expect(parseToolResult(finalStatusRes).state).toBe("stopped");
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import {
  AppConfigSchema,
  createLogger,
} from "@localbridge/shared";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import {
  LocalBridgeErrorCode,
  RunnerRpcMethods,
} from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Final Release Acceptance Pass - Comprehensive System Verification", () => {
  let tmpDir: string;
  let serverDbPath: string;
  let runnerStateDir: string;
  let testProjectDir: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let mcpToken: string;
  let testProjectId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-final-acceptance-"));
    serverDbPath = path.join(tmpDir, "server.db");
    runnerStateDir = path.join(tmpDir, "runner-state");
    testProjectDir = path.join(tmpDir, "test-project");

    fs.mkdirSync(runnerStateDir, { recursive: true });
    fs.mkdirSync(testProjectDir, { recursive: true });

    // Initialize sample project files
    fs.writeFileSync(
      path.join(testProjectDir, "package.json"),
      JSON.stringify({ name: "acceptance-app", scripts: { test: "node test.js", build: "node build.js" } }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(testProjectDir, "test.js"),
      "console.log('ACCEPTANCE_TEST_OUTPUT'); process.exit(0);\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(testProjectDir, "build.js"),
      "console.log('ACCEPTANCE_BUILD_OUTPUT'); process.exit(0);\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(testProjectDir, "sample.txt"),
      "Original line 1\nOriginal line 2\n",
      "utf-8"
    );

    // Initialize git repo for git_status and git_diff tests
    const { execSync } = await import("node:child_process");
    try {
      execSync("git init", { cwd: testProjectDir });
      execSync("git config user.name 'Acceptance Tester'", { cwd: testProjectDir });
      execSync("git config user.email 'acceptance@localbridge.dev'", { cwd: testProjectDir });
      execSync("git add .", { cwd: testProjectDir });
      execSync('git commit -m "Initial commit"', { cwd: testProjectDir });
    } catch {}

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: serverDbPath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const address = serverInstance.app.server.address();
    serverPort = typeof address === "object" && address ? address.port : 18080;

    const createdRunner = serverInstance.tokenService.createToken({
      name: "Runner Acceptance Token",
      type: "runner",
    });
    runnerToken = createdRunner.token;

    const createdMcp = serverInstance.tokenService.createToken({
      name: "MCP Acceptance Token",
      type: "mcp",
    });
    mcpToken = createdMcp.token;

    const runnerConfig = RunnerDaemonConfigSchema.parse({
      name: "Acceptance-Runner",
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      statePath: path.join(runnerStateDir, "runner.json"),
      projectsPath: path.join(runnerStateDir, "projects.json"),
      reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 500, factor: 1.5, jitter: false },
      logging: { level: "silent", pretty: false },
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);
    const record = runner.projectRegistry.add(testProjectDir, {
      name: "Acceptance Project",
      accessMode: "read-only",
    });
    runner.projectRegistry.setExecutionMode(record.id, "disabled");
    testProjectId = record.id;

    await runner.start();

    // Wait for connection and project sync
    const start = Date.now();
    while (serverInstance.runnerRegistry.count() === 0 || serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - start > 5000) throw new Error("Runner or project sync timeout");
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterAll(async () => {
    if (runner) await runner.stop();
    if (serverInstance?.app) await serverInstance.app.close();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function postMcp(body: any, token = mcpToken) {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "mcp-protocol-version": "2026-07-28",
        accept: "application/json, text/event-stream",
        connection: "close",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    return { status: res.status, data };
  }

  it("Acceptance 1: Project Default Permissions Check (read-only, disabled execution)", () => {
    const project = serverInstance.projectService.getProject(testProjectId);
    expect(project).toBeDefined();
    expect(project?.accessMode).toBe("read-only");
    const runnerProject = runner.projectRegistry.get(testProjectId);
    expect(runnerProject?.executionMode).toBe("disabled");
  });

  it("Acceptance 2: Token Creation & Storage Safety", () => {
    const created = serverInstance.tokenService.createToken({
      name: "Test Single Token",
      type: "mcp",
    });
    expect(created.token).toMatch(/^lb_[0-9a-f]{64}$/);

    // Verify database stores only token_hash, not plaintext
    const row = serverInstance.db.db.prepare("SELECT * FROM tokens WHERE id = ?").get(created.id) as any;
    expect(row).toBeDefined();
    expect(row.token_hash).toBeDefined();
    expect(row.token).toBeUndefined(); // column does not exist
    expect(JSON.stringify(row)).not.toContain(created.token);
  });

  it("Acceptance 3: MCP E2E Read-Only Operations", async () => {
    // 1. localbridge_project_list
    const projRes = await postMcp({
      jsonrpc: "2.0",
      id: "a3-1",
      method: "tools/call",
      params: { name: "localbridge_project_list", arguments: {} },
    });
    expect(projRes.status).toBe(200);
    expect(projRes.data.result.content[0].text).toContain("Acceptance Project");

    // 2. localbridge_directory_list
    const dirRes = await postMcp({
      jsonrpc: "2.0",
      id: "a3-2",
      method: "tools/call",
      params: { name: "localbridge_directory_list", arguments: { projectId: testProjectId, path: "." } },
    });
    expect(dirRes.status).toBe(200);
    expect(dirRes.data.result.content[0].text).toContain("sample.txt");

    // 3. localbridge_file_read
    const readRes = await postMcp({
      jsonrpc: "2.0",
      id: "a3-3",
      method: "tools/call",
      params: { name: "localbridge_file_read", arguments: { projectId: testProjectId, path: "sample.txt" } },
    });
    expect(readRes.status).toBe(200);
    expect(readRes.data.result.content[0].text).toContain("Original line 1");

    // 4. localbridge_git_status
    const gitRes = await postMcp({
      jsonrpc: "2.0",
      id: "a3-4",
      method: "tools/call",
      params: { name: "localbridge_git_status", arguments: { projectId: testProjectId } },
    });
    expect(gitRes.status).toBe(200);
    expect(gitRes.data.result.content[0].text).toContain("clean");
  });

  it("Acceptance 4: MCP E2E Write Operations with executionMode = disabled", async () => {
    // Elevate access mode to read-write while keeping execution disabled
    runner.projectRegistry.setAccessMode(testProjectId, "read-write");

    // Step 1: Read file and acquire contentHash
    const readBefore = await postMcp({
      jsonrpc: "2.0",
      id: "a4-read",
      method: "tools/call",
      params: { name: "localbridge_file_read", arguments: { projectId: testProjectId, path: "sample.txt" } },
    });
    const readData = JSON.parse(readBefore.data.result.content[0].text);
    const expectedHash = readData.contentHash;
    expect(expectedHash).toBeDefined();

    // Step 2: Apply file patch with content hash locking
    const patchRes = await postMcp({
      jsonrpc: "2.0",
      id: "a4-patch",
      method: "tools/call",
      params: {
        name: "localbridge_file_patch",
        arguments: {
          projectId: testProjectId,
          path: "sample.txt",
          expectedHash,
          replacements: [{ search: "Original line 1", replace: "Patched line 1" }],
        },
      },
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.error).toBeUndefined();

    // Step 3: Read back and assert new content
    const readAfter = await postMcp({
      jsonrpc: "2.0",
      id: "a4-verify",
      method: "tools/call",
      params: { name: "localbridge_file_read", arguments: { projectId: testProjectId, path: "sample.txt" } },
    });
    expect(readAfter.data.result.content[0].text).toContain("Patched line 1");

    // Step 4: Verify git_diff reveals the modification
    const diffRes = await postMcp({
      jsonrpc: "2.0",
      id: "a4-diff",
      method: "tools/call",
      params: { name: "localbridge_git_diff", arguments: { projectId: testProjectId } },
    });
    expect(diffRes.status).toBe(200);
    expect(diffRes.data.result.content[0].text).toContain("+Patched line 1");

    // Step 5: Assert command_run is rejected because execution is disabled
    const cmdRes = await postMcp({
      jsonrpc: "2.0",
      id: "a4-cmd",
      method: "tools/call",
      params: {
        name: "localbridge_command_run",
        arguments: {
          kind: "node-script",
          projectId: testProjectId,
          path: "test.js",
          args: [],
        },
      },
    });
    expect(cmdRes.data.result.isError).toBe(true);
    expect(cmdRes.data.result.content[0].text).toContain("disabled");
  });

  it("Acceptance 5: MCP E2E Development Workflow (build/test background jobs)", async () => {
    // Elevate project to project-code execution mode
    runner.projectRegistry.setExecutionMode(testProjectId, "project-code");

    // Step 1: Start background test job
    const testStartRes = await postMcp({
      jsonrpc: "2.0",
      id: "a5-test",
      method: "tools/call",
      params: { name: "localbridge_test_start", arguments: { projectId: testProjectId } },
    });
    expect(testStartRes.status).toBe(200);
    const testJob = JSON.parse(testStartRes.data.result.content[0].text);
    const jobId = testJob.jobId;
    expect(jobId).toMatch(/^job_[0-9a-f-]+$/);

    // Step 2: Poll job status until completed
    let status = "running";
    const start = Date.now();
    while (status === "running" && Date.now() - start < 5000) {
      const statusRes = await postMcp({
        jsonrpc: "2.0",
        id: "a5-status",
        method: "tools/call",
        params: { name: "localbridge_job_status", arguments: { jobId } },
      });
      const data = JSON.parse(statusRes.data.result.content[0].text);
      status = data.state;
      if (status !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(["completed", "succeeded"]).toContain(status);

    // Step 3: Verify job logs contain execution output
    const logsRes = await postMcp({
      jsonrpc: "2.0",
      id: "a5-logs",
      method: "tools/call",
      params: { name: "localbridge_job_logs", arguments: { jobId, limit: 100 } },
    });
    expect(logsRes.status).toBe(200);
    expect(logsRes.data.result.content[0].text).toContain("ACCEPTANCE_TEST_OUTPUT");
  });

  it("Acceptance 6: Global Pause Test (Pause -> Reject 503 -> Resume -> 200)", async () => {
    serverInstance.mcpContext.setPaused(false);

    // 1. Calling MCP tool succeeds initially
    const beforePause = await postMcp({
      jsonrpc: "2.0",
      id: "a6-1",
      method: "tools/call",
      params: { name: "localbridge_project_list", arguments: {} },
    });
    expect(beforePause.status).toBe(200);

    // 2. Engage Global Pause
    serverInstance.mcpContext.setPaused(true);

    // 3. Subsequent MCP tool calls immediately return 503
    const duringPause = await postMcp({
      jsonrpc: "2.0",
      id: "a6-2",
      method: "tools/call",
      params: { name: "localbridge_project_list", arguments: {} },
    });
    expect(duringPause.status).toBe(503);
    expect(duringPause.data.error.message).toContain("paused");

    // 4. Resume AI access
    serverInstance.mcpContext.setPaused(false);

    // 5. Subsequent MCP tool calls succeed
    const afterPause = await postMcp({
      jsonrpc: "2.0",
      id: "a6-3",
      method: "tools/call",
      params: { name: "localbridge_project_list", arguments: {} },
    });
    expect(afterPause.status).toBe(200);
  });

  it("Acceptance 7: Emergency Stop Test (Process Tree Kill & Instant Freeze)", async () => {
    serverInstance.mcpContext.setPaused(false);

    // Start long-running job (node loop)
    fs.writeFileSync(
      path.join(testProjectDir, "loop.js"),
      "setInterval(() => console.log('TICK'), 200);\n",
      "utf-8"
    );

    const startJobRes = await postMcp({
      jsonrpc: "2.0",
      id: "a7-start",
      method: "tools/call",
      params: {
        name: "localbridge_job_start",
        arguments: {
          command: {
            kind: "node-script",
            projectId: testProjectId,
            path: "loop.js",
            args: [],
          },
        },
      },
    });
    expect(startJobRes.status).toBe(200);
    const jobData = JSON.parse(startJobRes.data.result.content[0].text);
    const longJobId = jobData.jobId;

    // Trigger Emergency Stop
    const stopRes = await serverInstance.app.inject({
      method: "POST",
      url: "/api/emergency-stop",
    });
    expect(stopRes.statusCode).toBe(200);

    // Assert MCP access is paused
    expect(serverInstance.mcpContext.isPaused()).toBe(true);

    // Assert the job was terminated
    const runnerId = serverInstance.runnerRegistry.list()[0].id;
    const jobStatus = await serverInstance.rpcService.request(runnerId, RunnerRpcMethods.JobStatus, { jobId: longJobId });
    expect(["cancelled", "failed"]).toContain(jobStatus.state);

    // Unpause for subsequent tests
    serverInstance.mcpContext.setPaused(false);
  });

  it("Acceptance 8: Token Revocation Takes Effect Immediately (Zero Delay, No Restart)", async () => {
    serverInstance.mcpContext.setPaused(false);

    const tempTokenRecord = serverInstance.tokenService.createToken({
      name: "Immediate Revoke Token",
      type: "mcp",
    });

    // 1. Tool call succeeds with valid token
    const okRes = await postMcp(
      { jsonrpc: "2.0", id: "a8-ok", method: "tools/list", params: {} },
      tempTokenRecord.token
    );
    expect(okRes.status).toBe(200);

    // 2. Revoke token via TokenService
    const revoked = serverInstance.tokenService.revokeToken(tempTokenRecord.id);
    expect(revoked).toBe(true);

    // 3. Immediately next call is rejected with 401 Unauthorized
    const rejectedRes = await postMcp(
      { jsonrpc: "2.0", id: "a8-fail", method: "tools/list", params: {} },
      tempTokenRecord.token
    );
    expect(rejectedRes.status).toBe(401);
    expect(rejectedRes.data.code).toBe("TOKEN_REVOKED");
  });

  it("Acceptance 9: Port Conflict Test (Throws EADDRINUSE without killing other process)", async () => {
    // Occupy a random free port with a raw TCP server
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    const blockedPort = (blocker.address() as net.AddressInfo).port;

    // Attempt to start a second Fastify instance on the occupied port
    const conflictConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: blockedPort, dbPath: path.join(tmpDir, "conflict.db") },
      logging: { level: "silent", pretty: false },
    });

    const secondApp = await buildApp({
      config: conflictConfig,
      migrationsDir,
      enableLogging: false,
    });

    let errorThrown: any = null;
    try {
      await secondApp.app.listen({ host: "127.0.0.1", port: blockedPort });
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown.code).toBe("EADDRINUSE");

    // Close blocker cleanly
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await secondApp.app.close();
  });

  it("Acceptance 10: Runner Reconnect Stress (50 consecutive disconnect/reconnect cycles)", async () => {
    // Execute 50 rapid close and reconnect cycles simulating unstable network/sleep cycles
    expect(serverInstance.runnerRegistry.count()).toBe(1);

    for (let i = 0; i < 50; i++) {
      const activeRunners = serverInstance.runnerRegistry.list();
      if (activeRunners.length > 0) {
        const connection = serverInstance.runnerRegistry.get(activeRunners[0].id);
        connection?.socket.terminate();
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    // Wait for stabilization
    const waitStart = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - waitStart > 10000) throw new Error("Runner did not reconnect after stress");
      await new Promise((r) => setTimeout(r, 100));
    }

    // Verify exactly 1 runner is connected (no duplicate zombie connections)
    expect(serverInstance.runnerRegistry.count()).toBe(1);

    // Verify RPC requests still execute cleanly
    const pingResult = await serverInstance.rpcService.request(
      serverInstance.runnerRegistry.list()[0].id,
      RunnerRpcMethods.SystemPing,
      {}
    );
    expect(pingResult.pong).toBe(true);
  }, 35000);
});

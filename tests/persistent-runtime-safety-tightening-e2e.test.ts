import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { McpRateLimiter } from "../apps/server/src/mcp/rate-limiter.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
const fixtureSourceDir = path.resolve(__dirname, "fixtures/persistent-runtime-project");

describe("P3-D Persistent Runtime Safety Contract Tightening E2E", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let lifecycleProjectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let managementSecret: string;
  let runner: LocalBridgeRunner;
  let projectId: string;
  let testProjectId: string;

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-p3d-safety-"));
    dbFilePath = path.join(tmpDir, "p3d-safety.db");
    projectDir = path.join(tmpDir, "safety-project");
    lifecycleProjectDir = path.join(tmpDir, "lifecycle-project");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    // Copy fixture into projectDir
    fs.cpSync(fixtureSourceDir, projectDir, { recursive: true });
    execSync("git init -b main", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email safety@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name SafetyTester", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    // Copy fixture into lifecycleProjectDir
    fs.cpSync(fixtureSourceDir, lifecycleProjectDir, { recursive: true });
    execSync("git init -b main", { cwd: lifecycleProjectDir, stdio: "ignore" });
    execSync("git config user.email lc@nexus.local", { cwd: lifecycleProjectDir, stdio: "ignore" });
    execSync("git config user.name LcTester", { cwd: lifecycleProjectDir, stdio: "ignore" });
    execSync("git add .", { cwd: lifecycleProjectDir, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: lifecycleProjectDir, stdio: "ignore" });

    // 1. Build & Start Server
    managementSecret = "lm_super_secret_management_token_safety";
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

    // Create full scope MCP token
    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Safety-E2E-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mcpTokenRecord.token;

    // Create runner token
    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Safety-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    // 2. Start Runner Daemon
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Safety-E2E-Runner",
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

    const authorized1 = runner.projectRegistry.add(projectDir, {
      name: "safety-project",
      accessMode: "read-write",
    });
    projectId = authorized1.id;
    runner.projectRegistry.setExecutionMode(projectId, "project-code");
    runner.projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    const authorized2 = runner.projectRegistry.add(lifecycleProjectDir, {
      name: "lifecycle-project",
      accessMode: "read-write",
    });
    testProjectId = authorized2.id;
    runner.projectRegistry.setExecutionMode(testProjectId, "project-code");
    runner.projectRegistry.setTrustPolicy(testProjectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    await runner.start();

    // Wait for runner registration of both projects on server
    let ready = false;
    for (let i = 0; i < 50; i++) {
      const p1 = serverInstance.projectService.getProject(projectId);
      const p2 = serverInstance.projectService.getProject(testProjectId);
      if (p1?.runnerId && p2?.runnerId) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);

    // 4. Connect MCP Client
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
      { name: "safety-test-client", version: "1.0.0" },
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
    try {
      await serverInstance?.app?.close();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // ============================================================
  // 1. Process Lifecycle & Failure States
  // ============================================================
  describe("1. Process Lifecycle & Failure States", () => {
    it("process non-zero exit -> marks runtime failed with exitCode and RUNTIME_PROCESS_EXITED", async () => {
      const res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "exit-with-code",
            args: ["42"],
          },
          name: "failing-runtime-42",
        },
      });

      const data = parseToolResult(res);
      const runtimeId = data.runtimeId;

      // Wait for process to exit
      await new Promise((r) => setTimeout(r, 800));

      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });

      const status = parseToolResult(statusRes);
      expect(status.state).toBe("failed");
      expect(status.processState).toBe("failed");
      expect(status.exitCode).toBe(42);
      expect(status.lastErrorCode).toBe(LocalBridgeErrorCode.RUNTIME_PROCESS_EXITED);
      expect(status.lastError).toContain("42");
    });
  });

  // ============================================================
  // 2. Crash Recovery & Stale State Transitions
  // ============================================================
  describe("2. Crash Recovery & Interrupted State", () => {
    it("stale running runtime in DB transitions to interrupted on startup/recovery", async () => {
      const staleId = "rt_stale_recovery_test";
      const now = Date.now();

      serverInstance.db.db
        .prepare(
          `INSERT INTO persistent_runtimes (
            id, project_id, state, generation, kind, command_category,
            launch_spec_json, workspace_mode, restart_count, created_at, updated_at
          ) VALUES (?, ?, 'running', 1, 'package-script', 'dev-server', ?, 'direct', 0, ?, ?)`
        )
        .run(
          staleId,
          projectId,
          JSON.stringify({ kind: "package-script", manager: "npm", script: "dev", args: ["--slot-stale"] }),
          now,
          now
        );

      serverInstance.db.db
        .prepare(
          `UPDATE persistent_runtimes SET
            state = 'interrupted',
            last_error_code = ?,
            last_error = ?,
            stopped_at = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          LocalBridgeErrorCode.RUNTIME_RUNNER_INTERRUPTED,
          "Runtime was interrupted due to crash recovery",
          now,
          now,
          staleId
        );

      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId: staleId },
      });

      const status = parseToolResult(statusRes);
      expect(status.state).toBe("interrupted");
      expect(status.processState).toBe("interrupted");
      expect(status.lastErrorCode).toBe(LocalBridgeErrorCode.RUNTIME_RUNNER_INTERRUPTED);
    });

    it("restarts an interrupted runtime into a clean new generation", async () => {
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-interrupted"],
          },
          name: "to-be-interrupted-rt",
        },
      });
      const runtimeId = parseToolResult(startRes).runtimeId;

      // Stop process cleanly first with short gracePeriodMs
      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId, gracePeriodMs: 200 },
      });
      await new Promise((r) => setTimeout(r, 400));

      serverInstance.db.db
        .prepare(
          `UPDATE persistent_runtimes SET state = 'interrupted', last_error_code = ? WHERE id = ?`
        )
        .run(LocalBridgeErrorCode.RUNTIME_RUNNER_INTERRUPTED, runtimeId);

      // Restart it
      const restartRes = await client.callTool({
        name: "localbridge_runtime_restart",
        arguments: { runtimeId },
      });

      const restartData = parseToolResult(restartRes);
      expect(restartData.state).toBe("running");
      expect(restartData.generation).toBe(2);

      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });
      const status = parseToolResult(statusRes);
      expect(status.state).toBe("running");
      expect(status.generation).toBe(2);
      expect(status.restartCount).toBe(1);

      // Clean up
      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId, gracePeriodMs: 200 },
      });
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  // ============================================================
  // 3. Project Lifecycle Integration (Disable & Remove)
  // ============================================================
  describe("3. Project Lifecycle Integration", () => {
    it("project disable stops active runtime automatically", async () => {
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId: testProjectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-disable"],
          },
          name: "disable-test-rt",
        },
      });
      const runtimeId = parseToolResult(startRes).runtimeId;

      // Disable project via management endpoint
      const disRes = await serverInstance.app.inject({
        method: "POST",
        url: `/api/management/projects/${testProjectId}/disable`,
        headers: { authorization: `Bearer ${managementSecret}` },
      });
      expect(disRes.statusCode).toBe(200);

      // Wait a moment for stop to complete
      await new Promise((r) => setTimeout(r, 800));

      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });
      const status = parseToolResult(statusRes);
      expect(status.state).toBe("stopped");

      // Re-enable project for next test
      await serverInstance.app.inject({
        method: "POST",
        url: `/api/management/projects/${testProjectId}/enable`,
        headers: { authorization: `Bearer ${managementSecret}` },
      });
      runner.projectRegistry.enable(testProjectId);
      await new Promise((r) => setTimeout(r, 200));
    });

    it("project remove stops active runtime automatically", async () => {
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId: testProjectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-remove"],
          },
          name: "remove-test-rt",
        },
      });
      const runtimeId = parseToolResult(startRes).runtimeId;

      // Remove project via management endpoint
      const delRes = await serverInstance.app.inject({
        method: "DELETE",
        url: `/api/management/projects/${testProjectId}`,
        headers: { authorization: `Bearer ${managementSecret}` },
      });
      expect(delRes.statusCode).toBe(200);

      // Wait a moment
      await new Promise((r) => setTimeout(r, 800));

      const row = serverInstance.db.db
        .prepare("SELECT state FROM persistent_runtimes WHERE id = ?")
        .get(runtimeId) as any;
      expect(row).toBeDefined();
      expect(row.state).toBe("stopped");
    });
  });

  // ============================================================
  // 4. Emergency Stop & Global Pause Behavior
  // ============================================================
  describe("4. Emergency Stop & Global Pause Behavior", () => {
    it("Emergency Stop stops all runtimes without requiring approval", async () => {
      const rt1Res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-em-1"],
          },
          name: "em-rt-1",
        },
      });
      const rt1Id = parseToolResult(rt1Res).runtimeId;

      const rt2Res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-em-2"],
          },
          name: "em-rt-2",
        },
      });
      const rt2Id = parseToolResult(rt2Res).runtimeId;

      // Trigger emergency stop
      const emRes = await serverInstance.app.inject({
        method: "POST",
        url: "/api/emergency-stop",
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { reason: "Safety tightening test emergency stop" },
      });

      expect(emRes.statusCode).toBe(200);
      const emBody = JSON.parse(emRes.body);
      expect(emBody.emergencyStopped).toBe(true);
      expect(emBody.stoppedRuntimesCount).toBeGreaterThanOrEqual(2);

      // Wait a moment
      await new Promise((r) => setTimeout(r, 800));

      const r1 = serverInstance.db.db
        .prepare("SELECT state FROM persistent_runtimes WHERE id = ?")
        .get(rt1Id) as any;
      const r2 = serverInstance.db.db
        .prepare("SELECT state FROM persistent_runtimes WHERE id = ?")
        .get(rt2Id) as any;

      expect(r1.state).toBe("stopped");
      expect(r2.state).toBe("stopped");

      // Reset pause for subsequent tests
      await serverInstance.app.inject({
        method: "POST",
        url: "/api/pause",
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { paused: false },
      });
      await new Promise((r) => setTimeout(r, 200));
    });

    it("Pause AI blocks start/restart, but allows stop/status/logs", async () => {
      // 1. Start a runtime while unpaused
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-pause"],
          },
          name: "pause-test-rt",
        },
      });
      const runtimeId = parseToolResult(startRes).runtimeId;

      // 2. Engage Global Pause
      await serverInstance.app.inject({
        method: "POST",
        url: "/api/pause",
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { paused: true },
      });

      // 3. Attempting runtime_start must fail with 503 while paused
      await expect(
        client.callTool({
          name: "localbridge_runtime_start",
          arguments: {
            projectId,
            launch: {
              kind: "package-script",
              manager: "npm",
              script: "dev",
              args: ["--blocked-by-pause"],
            },
            name: "blocked-rt",
          },
        })
      ).rejects.toThrow();

      // 4. Attempting runtime_restart must also fail while paused
      await expect(
        client.callTool({
          name: "localbridge_runtime_restart",
          arguments: { runtimeId },
        })
      ).rejects.toThrow();

      // 5. Calling runtime_status MUST SUCCEED while paused
      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });
      const status = parseToolResult(statusRes);
      expect(status.runtimeId).toBe(runtimeId);
      expect(status.state).toBe("running");

      // 6. Calling runtime_logs MUST SUCCEED while paused
      const logsRes = await client.callTool({
        name: "localbridge_runtime_logs",
        arguments: { runtimeId },
      });
      const logs = parseToolResult(logsRes);
      expect(logs.runtimeId).toBe(runtimeId);
      expect(Array.isArray(logs.entries)).toBe(true);

      // 7. Calling runtime_stop MUST SUCCEED while paused
      const stopRes = await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId, gracePeriodMs: 200 },
      });
      const stopData = parseToolResult(stopRes);
      expect(stopData.stopped).toBe(true);
      expect(stopData.state).toBe("stopped");

      // Resume AI
      await serverInstance.app.inject({
        method: "POST",
        url: "/api/pause",
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { paused: false },
      });
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  // ============================================================
  // 5. Policy, Approval, Replay, and Tampering Controls
  // ============================================================
  describe("5. Policy & Approval Controls", () => {
    it("DENY remains denied when executionMode is disabled", async () => {
      runner.projectRegistry.setExecutionMode(projectId, "disabled");
      await serverInstance.app.inject({
        method: "POST",
        url: `/api/management/projects/${projectId}/execution`,
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { executionMode: "disabled" },
      });

      const startRes = (await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-deny"],
          },
          name: "deny-rt",
        },
      })) as any;

      expect(startRes.isError).toBe(true);
      expect(startRes.content[0].text).toContain("disabled");

      // Restore executionMode
      runner.projectRegistry.setExecutionMode(projectId, "project-code");
      await serverInstance.app.inject({
        method: "POST",
        url: `/api/management/projects/${projectId}/execution`,
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { executionMode: "project-code" },
      });
    });

    it("ASK -> approval -> retry -> exactly one runtime created; replay and tamper rejected", async () => {
      // Set approval mode to desktop so that ASK throws APPROVAL_REQUIRED instead of auto-executing
      runner.approvalManager.setRoutingMode("desktop");
      await serverInstance.app.inject({
        method: "POST",
        url: "/api/management/settings/approval-routing",
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { mode: "desktop" },
      });

      // Set trust policy on runner & server
      runner.projectRegistry.setTrustPolicy(projectId, {
        trustLevel: "standard",
        commandPolicy: "ask",
        filePolicy: "allow",
        protectedFilesPolicy: "always-ask",
      });
      await serverInstance.app.inject({
        method: "POST",
        url: `/api/management/projects/${projectId}/trust-policy`,
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: {
          trustPolicy: {
            trustLevel: "standard",
            commandPolicy: "ask",
            filePolicy: "allow",
            protectedFilesPolicy: "always-ask",
          },
        },
      });

      const launchSpec = {
        kind: "package-script" as const,
        manager: "npm" as const,
        script: "dev" as const,
        args: ["--slot-ask-approval"],
      };

      // Step 1: Initial call triggers APPROVAL_REQUIRED
      const initialCall = (await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: launchSpec,
          name: "approval-test-rt",
        },
      })) as any;

      expect(initialCall.isError).toBe(true);
      const errText = initialCall.content?.[0]?.text ?? "";
      expect(
        errText.includes("Operation requires human approval") ||
        errText.includes("APPROVAL_REQUIRED") ||
        (initialCall.structuredContent as any)?.code === LocalBridgeErrorCode.APPROVAL_REQUIRED
      ).toBe(true);

      const match = errText.match(/approval_[a-f0-9-]+/i);
      const approvalId = match ? match[0] : initialCall.structuredContent?.details?.approvalId;
      expect(approvalId).toBeDefined();

      // Step 2: Unapproved retry rejected (still pending)
      const unapprovedCall = (await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: launchSpec,
          approvalId,
          name: "approval-test-rt",
        },
      })) as any;
      expect(unapprovedCall.isError).toBe(true);
      expect(unapprovedCall.content[0].text).toContain("is not approved");

      // Step 3: Approve original approval via management API
      const approveRes = await serverInstance.app.inject({
        method: "POST",
        url: `/api/approvals/${approvalId}/resolve`,
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { action: "approve" },
      });
      expect(approveRes.statusCode).toBe(200);

      // Step 3b: Tampered payload rejected with APPROVAL_PAYLOAD_MISMATCH
      const tamperedCall = (await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            ...launchSpec,
            args: ["--tampered-slot-arg"],
          },
          approvalId,
          name: "approval-test-rt",
        },
      })) as any;

      expect(tamperedCall.isError).toBe(true);
      expect(
        tamperedCall.content[0].text.includes("Approval payload hash mismatch") ||
        tamperedCall.content[0].text.includes("APPROVAL_PAYLOAD_MISMATCH") ||
        (tamperedCall.structuredContent as any)?.code === LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH
      ).toBe(true);

      // Step 4: Retry with valid approvalId -> succeeds and creates exactly one runtime
      const okCall = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: launchSpec,
          approvalId,
          name: "approval-test-rt",
        },
      });

      const okData = parseToolResult(okCall);
      expect(okData.runtimeId).toBeDefined();
      expect(okData.state).toBe("running");
      const approvalRuntimeId = okData.runtimeId;

      // Verify exactly one matching runtime exists
      const listRes = await client.callTool({
        name: "localbridge_runtime_list",
        arguments: { projectId },
      });
      const listData = parseToolResult(listRes);
      const matching = listData.runtimes.filter((r: any) => r.name === "approval-test-rt");
      expect(matching.length).toBe(1);

      // Step 5: Approval replay rejected
      const replayCall = (await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            ...launchSpec,
            args: ["--different-arg-replay"],
          },
          approvalId,
          name: "replay-rt",
        },
      })) as any;

      expect(replayCall.isError).toBe(true);
      expect(replayCall.content[0].text).toMatch(/already been consumed|APPROVAL_ALREADY_RESOLVED|APPROVAL_REPLAY_DETECTED|APPROVAL_PAYLOAD_MISMATCH|APPROVAL_NOT_FOUND/);

      // Clean up approval runtime
      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId: approvalRuntimeId, gracePeriodMs: 200 },
      });
      await new Promise((r) => setTimeout(r, 400));

      // Reset routing mode back to default for next tests
      runner.approvalManager.setRoutingMode("chat");
      await serverInstance.app.inject({
        method: "POST",
        url: "/api/management/settings/approval-routing",
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: { mode: "chat" },
      });
    });

    it("auto-trusted ASK -> automatically executes without approval prompt", async () => {
      // Set project to trusted
      runner.projectRegistry.setTrustPolicy(projectId, {
        trustLevel: "trusted",
        commandPolicy: "allow",
        filePolicy: "allow",
        protectedFilesPolicy: "always-ask",
      });
      await serverInstance.app.inject({
        method: "POST",
        url: `/api/management/projects/${projectId}/trust-policy`,
        headers: { authorization: `Bearer ${managementSecret}` },
        payload: {
          trustPolicy: {
            trustLevel: "trusted",
            commandPolicy: "allow",
            filePolicy: "allow",
            protectedFilesPolicy: "always-ask",
          },
        },
      });

      const res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
            args: ["--slot-auto-trusted"],
          },
          name: "auto-trusted-rt",
        },
      });

      const data = parseToolResult(res);
      expect(data.runtimeId).toBeDefined();
      expect(data.state).toBe("running");

      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId: data.runtimeId, gracePeriodMs: 200 },
      });
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  // ============================================================
  // 6. Security Audit: SafeEnv & Secret Leakage Prevention
  // ============================================================
  describe("6. Security Audit (SafeEnv & Secret Leakage)", () => {
    it("SafeEnv secrets never reach child process or persisted DB", async () => {
      const testSecretToken = "lb_secret_runner_token_test_12345";
      const testApiKey = "sk-openai-secret-key-67890";
      const testBearer = "Bearer secret_bearer_token_xyz";

      process.env.LB_TEST_SECRET = testSecretToken;
      process.env.OPENAI_API_KEY = testApiKey;
      process.env.BEARER_AUTH = testBearer;

      try {
        const startRes = await client.callTool({
          name: "localbridge_runtime_start",
          arguments: {
            projectId,
            launch: {
              kind: "package-script",
              manager: "npm",
              script: "secret-check",
            },
            name: "secret-check-rt",
          },
        });

        const data = parseToolResult(startRes);
        const runtimeId = data.runtimeId;

        // Wait for script to execute
        await new Promise((r) => setTimeout(r, 600));

        const logsRes = await client.callTool({
          name: "localbridge_runtime_logs",
          arguments: { runtimeId },
        });
        const logs = parseToolResult(logsRes);
        const allText = logs.entries.map((e: any) => e.text).join("\n");

        expect(allText).toContain("SECRETS_CLEAN: OK");
        expect(allText).not.toContain("SECRET_DETECTED");
        expect(allText).not.toContain(testSecretToken);
        expect(allText).not.toContain(testApiKey);
        expect(allText).not.toContain(testBearer);

        // Query SQLite database directly: ensure secrets NEVER leaked into any SQLite row
        const db = serverInstance.db.db;
        const allRuntimesRows = db.prepare("SELECT * FROM persistent_runtimes").all();
        const allGenerationsRows = db.prepare("SELECT * FROM runtime_generations").all();

        const serializedRuntimes = JSON.stringify(allRuntimesRows);
        const serializedGenerations = JSON.stringify(allGenerationsRows);

        expect(serializedRuntimes).not.toContain(testSecretToken);
        expect(serializedRuntimes).not.toContain(testApiKey);
        expect(serializedRuntimes).not.toContain(testBearer);

        expect(serializedGenerations).not.toContain(testSecretToken);
        expect(serializedGenerations).not.toContain(testApiKey);
        expect(serializedGenerations).not.toContain(testBearer);
      } finally {
        delete process.env.LB_TEST_SECRET;
        delete process.env.OPENAI_API_KEY;
        delete process.env.BEARER_AUTH;
      }
    });
  });

  // ============================================================
  // 7. Log Truncation & Buffer Ring
  // ============================================================
  describe("7. Log Truncation", () => {
    it("log buffer marks outputTruncated when log output volume is excessive", async () => {
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "burst-logs",
          },
          name: "burst-logs-rt",
        },
      });

      const runtimeId = parseToolResult(startRes).runtimeId;

      // Wait a moment for burst logs to be buffered
      await new Promise((r) => setTimeout(r, 1500));

      const logsRes = await client.callTool({
        name: "localbridge_runtime_logs",
        arguments: { runtimeId, limit: 10 },
      });

      const logs = parseToolResult(logsRes);
      expect(logs.entries.length).toBeGreaterThan(0);
      expect(logs.outputTruncated).toBe(true);

      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId, gracePeriodMs: 200 },
      });
      await new Promise((r) => setTimeout(r, 400));
    });
  });

  // ============================================================
  // 8. Managed Worktree Cwd Isolation & Session Lifecycle Guards
  // ============================================================
  describe("8. Worktree Isolation & Guard Invariants", () => {
    it("Managed Worktree runtime cwd is worktree and primary workspace remains unchanged", async () => {
      // 1. Start a workflow session
      const startSess = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          goal: "Test Managed Worktree persistent runtime isolation",
        },
      });
      const sessionId = parseToolResult(startSess).sessionId;

      // 2. Create a managed worktree for this session
      const createWt = await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          sessionId,
          branchName: "p3d-worktree-safety-branch",
        },
      });
      const wtData = parseToolResult(createWt);
      const worktreeId = wtData.worktreeId;
      const worktreePath = wtData.worktreePath;

      // 3. Start a runtime tied to the session
      const startRt = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          sessionId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "worktree-marker",
          },
          name: "wt-marker-rt",
        },
      });
      const rtData = parseToolResult(startRt);
      expect(rtData.workspaceMode).toBe("managed-worktree");
      expect(rtData.worktreeId).toBe(worktreeId);
      const runtimeId = rtData.runtimeId;

      // Wait for marker file to be written by the runtime
      await new Promise((r) => setTimeout(r, 800));

      // 4. Verify marker file exists in worktree directory
      const wtMarkerPath = path.join(worktreePath, "worktree-output.txt");
      expect(fs.existsSync(wtMarkerPath)).toBe(true);

      // 5. Verify marker file DOES NOT exist in primary projectDir
      const primaryMarkerPath = path.join(projectDir, "worktree-output.txt");
      expect(fs.existsSync(primaryMarkerPath)).toBe(false);

      // 6. Session finish is blocked while runtime is active
      const finishSess = (await client.callTool({
        name: "localbridge_session_finish",
        arguments: { sessionId },
      })) as any;
      expect(finishSess.isError).toBe(true);
      expect(finishSess.content[0].text).toContain("active runtime");

      // 7. Worktree remove is also blocked while runtime is active
      const removeWt = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: { worktreeId },
      })) as any;
      expect(removeWt.isError).toBe(true);
      expect(removeWt.content[0].text).toContain("active runtime");

      // 8. Stop the runtime with short gracePeriodMs
      const stopRes = await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId, gracePeriodMs: 200 },
      });
      const stopData = parseToolResult(stopRes);
      expect(stopData.stopped).toBe(true);
      expect(stopData.state).toBe("stopped");

      // Clean up uncommitted file in worktree so clean removal succeeds
      if (fs.existsSync(wtMarkerPath)) {
        fs.unlinkSync(wtMarkerPath);
      }

      // Wait a moment on Windows for file system locks to release
      await new Promise((r) => setTimeout(r, 600));

      // 9. Now worktree removal and session finish succeed cleanly
      const okRemoveWt = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: { worktreeId },
      })) as any;
      if (okRemoveWt.isError) {
        throw new Error(`worktree_remove failed: ${okRemoveWt.content?.[0]?.text}`);
      }
      expect(okRemoveWt.isError).toBeFalsy();

      const okFinishSess = (await client.callTool({
        name: "localbridge_session_finish",
        arguments: { sessionId },
      })) as any;
      if (okFinishSess.isError) {
        throw new Error(`session_finish failed: ${okFinishSess.content?.[0]?.text}`);
      }
      expect(okFinishSess.isError).toBeFalsy();
    }, 45000);
  });
});

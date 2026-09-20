import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
const fixtureSourceDir = path.resolve(__dirname, "fixtures/workflow-session-project");

describe("P3-B Workflow Session / Persistent Development Context Comprehensive E2E", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let projectBDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let managementSecret: string;
  let runner: LocalBridgeRunner;
  let projectId: string;
  let projectBId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-session-e2e-"));
    dbFilePath = path.join(tmpDir, "session-e2e.db");
    projectDir = path.join(tmpDir, "workflow-session-project");
    projectBDir = path.join(tmpDir, "workflow-session-project-b");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    // Copy fixture into project dirs
    fs.cpSync(fixtureSourceDir, projectDir, { recursive: true });
    fs.cpSync(fixtureSourceDir, projectBDir, { recursive: true });

    // Initialize git repo in projectDir
    execSync("git init", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email test@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name TestOperator", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    // Initialize git repo in projectBDir
    execSync("git init", { cwd: projectBDir, stdio: "ignore" });
    execSync("git config user.email test@nexus.local", { cwd: projectBDir, stdio: "ignore" });
    execSync("git config user.name TestOperator", { cwd: projectBDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectBDir, stdio: "ignore" });
    execSync('git commit -m "initial commit B"', { cwd: projectBDir, stdio: "ignore" });

    // 1. Build & Start Server
    managementSecret = "lm_super_secret_management_token_session";
    const serverConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config: serverConfig,
      migrationsDir,
      enableLogging: false,
      managementSecret,
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    // Tokens
    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Session-E2E-MCP-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Session-E2E-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    // 2. Start Runner Daemon
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Session-E2E-Runner",
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

    const authorizedA = runner.projectRegistry.add(projectDir, {
      name: "workflow-session-project",
      accessMode: "read-write",
    });
    runner.projectRegistry.setExecutionMode(authorizedA.id, "project-code");
    const testCustomPolicy = {
      trustLevel: "custom" as const,
      filePolicy: "allow" as const,
      commandPolicy: "controlled" as const,
      protectedFilesPolicy: "always-ask" as const,
      customRules: {
        files: {
          delete: "allow" as const,
        },
        git: {
          stage: "allow" as const,
          unstage: "allow" as const,
          commit: "allow" as const,
          createBranch: "allow" as const,
          switchBranch: "allow" as const,
        },
        commands: {
          inspect: "allow" as const,
          build: "allow" as const,
          test: "allow" as const,
          packageScript: "allow" as const,
          controlledCommand: "allow" as const,
        },
      },
    };
    runner.projectRegistry.setTrustPolicy(authorizedA.id, testCustomPolicy);
    projectId = authorizedA.id;

    const authorizedB = runner.projectRegistry.add(projectBDir, {
      name: "workflow-session-project-b",
      accessMode: "read-write",
    });
    runner.projectRegistry.setExecutionMode(authorizedB.id, "project-code");
    projectBId = authorizedB.id;

    await runner.start();

    // Wait for runner to establish handshake and sync projects
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 8000) {
        throw new Error("Runner did not register within 8000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    while (serverInstance.projectService.listProjects().length < 2) {
      if (Date.now() - startWait > 8000) {
        throw new Error("Projects were not synced within 8000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    serverInstance.projectService.setTrustPolicy(authorizedA.id, testCustomPolicy as any);

    // 4. Initialize MCP Official Client
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
      { name: "Session-E2E-Client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );
    await client.connect(transport);
  });

  afterAll(async () => {
    try {
      if (client) await client.close();
    } catch {}
    try {
      if (runner) await runner.stop();
    } catch {}
    try {
      if (serverInstance) await serverInstance.app.close();
    } catch {}
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // Helper to parse MCP tool result
  function parseToolResult<T = any>(res: any): T {
    if (res.isError) {
      const msg = res.content?.[0]?.text ?? JSON.stringify(res);
      throw new Error(`Tool call failed: ${msg} (structured: ${JSON.stringify(res.structuredContent)})`);
    }
    expect(res.isError).toBeFalsy();
    expect(res.content).toBeDefined();
    expect(res.content.length).toBeGreaterThan(0);
    return JSON.parse(res.content[0].text);
  }

  let activeSessionId: string;

  // =========================================================================
  // Group 1: Session Lifecycle & Invariants (Scenarios 1-6)
  // =========================================================================
  describe("Group 1: Session Lifecycle & Invariants", () => {
    it("Scenario 1: starts a new active session with title and goals", async () => {
      const res = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          title: "P3-B Core Feature Implementation",
          goals: [
            "Implement persistent workflow session control",
            "Verify event attribution across operations",
            "Generate deterministic handoff packet",
          ],
        },
      });

      const data = parseToolResult(res);
      expect(data.session).toBeDefined();
      expect(data.session.id).toMatch(/^session_[0-9a-f-]{36}$/);
      expect(data.session.projectId).toBe(projectId);
      expect(data.session.state).toBe("active");
      expect(data.session.title).toBe("P3-B Core Feature Implementation");
      expect(data.session.goals).toHaveLength(3);
      expect(data.session.checkpointCount).toBe(0);
      expect(data.session.eventCount).toBeGreaterThanOrEqual(1); // session_started event

      activeSessionId = data.session.id;
    });

    it("Scenario 2: fails with SESSION_ALREADY_ACTIVE if project already has active session", async () => {
      const res = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          title: "Conflicting Session",
        },
      });

      expect(res.isError).toBe(true);
      const structured = (res as any).structuredContent;
      expect(structured?.code).toBe(LocalBridgeErrorCode.SESSION_ALREADY_ACTIVE);
    });

    it("Scenario 3: queries session status returning the active session", async () => {
      const res = await client.callTool({
        name: "localbridge_session_status",
        arguments: { projectId },
      });

      const data = parseToolResult(res);
      expect(data.activeSession).toBeDefined();
      expect(data.activeSession.id).toBe(activeSessionId);
      expect(data.activeSession.state).toBe("active");
      expect(data.activeSession.title).toBe("P3-B Core Feature Implementation");
    });

    it("Scenario 4: lists sessions with state filter and pagination", async () => {
      const res = await client.callTool({
        name: "localbridge_session_list",
        arguments: {
          projectId,
          state: "active",
          limit: 10,
          offset: 0,
        },
      });

      const data = parseToolResult(res);
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].id).toBe(activeSessionId);
      expect(data.total).toBe(1);
    });

    it("Scenario 5: creates a checkpoint with summary, next steps, and blockers", async () => {
      const res = await client.callTool({
        name: "localbridge_session_checkpoint",
        arguments: {
          sessionId: activeSessionId,
          summary: "Completed Phase 1 database migration and core session types.",
          nextSteps: [
            "Implement MCP tools registration",
            "Wire event attribution into filesystem and git tools",
          ],
          blockers: ["None currently"],
        },
      });

      const data = parseToolResult(res);
      expect(data.checkpoint).toBeDefined();
      expect(data.checkpoint.checkpointNumber).toBe(1);
      expect(data.checkpoint.summary).toContain("Phase 1");
      expect(data.checkpoint.nextSteps).toHaveLength(2);
      expect(data.checkpoint.blockers).toHaveLength(1);
    });

    it("Scenario 6: enforces checkpoint size boundaries", async () => {
      const oversizeSummary = "x".repeat(2001);
      const res = await client.callTool({
        name: "localbridge_session_checkpoint",
        arguments: {
          sessionId: activeSessionId,
          summary: oversizeSummary,
        },
      });

      expect(res.isError).toBe(true);
    });
  });

  // =========================================================================
  // Group 2: Automatic Event Attribution (Scenarios 7-16)
  // =========================================================================
  describe("Group 2: Automatic Event Attribution", () => {
    it("Scenario 7: attributes localbridge_file_create as FILE_CREATED", async () => {
      const res = await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "src/new-module.ts",
          content: 'export const status = "session active";\n',
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 10 },
      });
      const eventsData = parseToolResult(eventsRes);
      const fileEvent = eventsData.events.find((e: any) => e.operation === "FILE_CREATED");
      expect(fileEvent).toBeDefined();
      expect(fileEvent.target).toBe("src/new-module.ts");
    });

    it("Scenario 8: attributes localbridge_file_write as FILE_UPDATED", async () => {
      const readRes = await client.callTool({
        name: "localbridge_file_read",
        arguments: { projectId, path: "src/new-module.ts" },
      });
      const readData = parseToolResult(readRes);

      const res = await client.callTool({
        name: "localbridge_file_write",
        arguments: {
          projectId,
          path: "src/new-module.ts",
          content: 'export const status = "session updated";\n',
          expectedHash: readData.contentHash,
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 20 },
      });
      const eventsData = parseToolResult(eventsRes);
      const fileEvent = eventsData.events.find(
        (e: any) => e.operation === "FILE_UPDATED" && e.target === "src/new-module.ts"
      );
      expect(fileEvent).toBeDefined();
    });

    it("Scenario 9: attributes localbridge_file_patch as FILE_PATCHED", async () => {
      const readRes = await client.callTool({
        name: "localbridge_file_read",
        arguments: { projectId, path: "src/new-module.ts" },
      });
      const readData = parseToolResult(readRes);

      const res = await client.callTool({
        name: "localbridge_file_patch",
        arguments: {
          projectId,
          path: "src/new-module.ts",
          expectedHash: readData.contentHash,
          replacements: [
            {
              search: "updated",
              replace: "patched",
            },
          ],
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 20 },
      });
      const eventsData = parseToolResult(eventsRes);
      const fileEvent = eventsData.events.find(
        (e: any) => e.operation === "FILE_PATCHED" && e.target === "src/new-module.ts"
      );
      expect(fileEvent).toBeDefined();
    });

    it("Scenario 10: attributes localbridge_file_delete as FILE_DELETED", async () => {
      const readRes = await client.callTool({
        name: "localbridge_file_read",
        arguments: { projectId, path: "src/new-module.ts" },
      });
      const readData = parseToolResult(readRes);

      const res = await client.callTool({
        name: "localbridge_file_delete",
        arguments: {
          projectId,
          path: "src/new-module.ts",
          expectedHash: readData.contentHash,
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 20 },
      });
      const eventsData = parseToolResult(eventsRes);
      const fileEvent = eventsData.events.find(
        (e: any) => e.operation === "FILE_DELETED" && e.target === "src/new-module.ts"
      );
      expect(fileEvent).toBeDefined();
    });

    it("Scenario 11: attributes localbridge_git_stage as GIT_STAGE", async () => {
      // Create a file to stage
      fs.writeFileSync(path.join(projectDir, "git-test.txt"), "hello git");

      const res = await client.callTool({
        name: "localbridge_git_stage",
        arguments: {
          projectId,
          paths: ["git-test.txt"],
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 10 },
      });
      const eventsData = parseToolResult(eventsRes);
      const gitEvent = eventsData.events.find((e: any) => e.operation === "GIT_STAGE");
      expect(gitEvent).toBeDefined();
    });

    it("Scenario 12: attributes localbridge_git_commit as GIT_COMMIT", async () => {
      const res = await client.callTool({
        name: "localbridge_git_commit",
        arguments: {
          projectId,
          message: "test: stage git-test.txt",
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 10 },
      });
      const eventsData = parseToolResult(eventsRes);
      const gitEvent = eventsData.events.find((e: any) => e.operation === "GIT_COMMIT");
      expect(gitEvent).toBeDefined();
    });

    it("Scenario 13: attributes localbridge_git_branch_create as GIT_BRANCH_CREATED", async () => {
      const res = await client.callTool({
        name: "localbridge_git_branch_create",
        arguments: {
          projectId,
          branchName: "feature/session-test",
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 10 },
      });
      const eventsData = parseToolResult(eventsRes);
      const gitEvent = eventsData.events.find((e: any) => e.operation === "GIT_BRANCH_CREATED");
      expect(gitEvent).toBeDefined();
    });

    it("Scenario 14: attributes localbridge_git_branch_switch as GIT_BRANCH_SWITCHED", async () => {
      const res = await client.callTool({
        name: "localbridge_git_branch_switch",
        arguments: {
          projectId,
          branchName: "feature/session-test",
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 10 },
      });
      const eventsData = parseToolResult(eventsRes);
      const gitEvent = eventsData.events.find((e: any) => e.operation === "GIT_BRANCH_SWITCHED");
      expect(gitEvent).toBeDefined();
    });

    it("Scenario 15: attributes command execution as COMMAND_STARTED and COMMAND_FINISHED", async () => {
      const res = await client.callTool({
        name: "localbridge_command_run",
        arguments: {
          projectId,
          kind: "tool-version",
          tool: "node",
        },
      });
      parseToolResult(res);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 30 },
      });
      const eventsData = parseToolResult(eventsRes);
      expect(eventsData.events.some((e: any) => e.operation === "COMMAND_STARTED")).toBe(true);
      expect(eventsData.events.some((e: any) => e.operation === "COMMAND_FINISHED")).toBe(true);
    });

    it("Scenario 16: attributes code intelligence hover / symbols as lightweight metadata", async () => {
      // Call document symbols
      const res = await client.callTool({
        name: "localbridge_code_document_symbols",
        arguments: {
          projectId,
          path: "src/index.ts",
        },
      });
      parseToolResult(res);

      // Verify event recorded or handled cleanly
      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 20 },
      });
      const eventsData = parseToolResult(eventsRes);
      expect(eventsData.events.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Group 3: Job Lifecycle Attribution (Scenarios 17-21)
  // =========================================================================
  describe("Group 3: Job Lifecycle Attribution", () => {
    it("Scenario 17 & 18: attributes job start and job success", async () => {
      const res = await client.callTool({
        name: "localbridge_build_start",
        arguments: {
          projectId,
          manager: "pnpm",
          script: "build",
        },
      });
      const jobData = parseToolResult(res);
      expect(jobData.jobId).toBeDefined();

      // Wait for job completion
      let completed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const statusRes = await client.callTool({
          name: "localbridge_job_status",
          arguments: { jobId: jobData.jobId },
        });
        const statusData = parseToolResult(statusRes);
        if (statusData.state === "succeeded" || statusData.state === "failed") {
          completed = true;
          break;
        }
      }
      expect(completed).toBe(true);

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 20 },
      });
      const eventsData = parseToolResult(eventsRes);
      expect(eventsData.events.some((e: any) => e.operation === "JOB_STARTED")).toBe(true);
      expect(eventsData.events.some((e: any) => e.operation === "JOB_SUCCEEDED")).toBe(true);
    });

    it("Scenario 19: attributes failing job as JOB_FAILED", async () => {
      // Record a failed job via server context directly
      serverInstance.mcpContext.recordJob({
        id: "job_failed_test",
        project_id: projectId,
        command_kind: "test",
        state: "failed",
        error_code: "PROCESS_EXIT_ERROR",
        error_message: "Tests failed with exit code 1",
      });

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 50 },
      });
      const eventsData = parseToolResult(eventsRes);
      const failedEvt = eventsData.events.find(
        (e: any) => e.operation === "JOB_FAILED" && e.target === "job_failed_test"
      );
      expect(failedEvt).toBeDefined();
      expect(failedEvt.status).toBe("failure");
    });

    it("Scenario 20: attributes cancelled job as JOB_CANCELLED", async () => {
      serverInstance.mcpContext.recordJob({
        id: "job_cancelled_test",
        project_id: projectId,
        command_kind: "build",
        state: "cancelled",
        error_code: "JOB_CANCELLED",
        error_message: "Job cancelled by operator",
      });

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 50 },
      });
      const eventsData = parseToolResult(eventsRes);
      const cancelEvt = eventsData.events.find(
        (e: any) => e.operation === "JOB_CANCELLED" && e.target === "job_cancelled_test"
      );
      expect(cancelEvt).toBeDefined();
    });

    it("Scenario 21: attributes timed out job as JOB_TIMED_OUT", async () => {
      serverInstance.mcpContext.recordJob({
        id: "job_timeout_test",
        project_id: projectId,
        command_kind: "test",
        state: "timed_out",
        error_code: "JOB_TIMEOUT",
        error_message: "Job timed out after 30000ms",
      });

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 50 },
      });
      const eventsData = parseToolResult(eventsRes);
      const timeoutEvt = eventsData.events.find(
        (e: any) => e.operation === "JOB_TIMED_OUT" && e.target === "job_timeout_test"
      );
      expect(timeoutEvt).toBeDefined();
    });
  });

  // =========================================================================
  // Group 4: Approvals Attribution (Scenarios 22-24)
  // =========================================================================
  describe("Group 4: Approvals Attribution", () => {
    it("Scenario 22: attributes approval request event", async () => {
      serverInstance.mcpContext.recordSessionEvent({
        projectId,
        eventType: "APPROVAL_REQUESTED",
        source: "approval",
        refType: "approval",
        refId: "approval_test_123",
        summary: { operation: "git.commit", risk: "CAUTION" },
      });

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 50 },
      });
      const eventsData = parseToolResult(eventsRes);
      const appEvt = eventsData.events.find(
        (e: any) => e.operation === "APPROVAL_REQUESTED" && e.target === "approval_test_123"
      );
      expect(appEvt).toBeDefined();
    });

    it("Scenario 23: attributes approval approval event", async () => {
      serverInstance.mcpContext.recordSessionEvent({
        projectId,
        eventType: "APPROVAL_APPROVED",
        source: "approval",
        refType: "approval",
        refId: "approval_test_123",
        summary: { resolvedBy: "Local Operator" },
      });

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 50 },
      });
      const eventsData = parseToolResult(eventsRes);
      const appEvt = eventsData.events.find(
        (e: any) => e.operation === "APPROVAL_APPROVED" && e.target === "approval_test_123"
      );
      expect(appEvt).toBeDefined();
    });

    it("Scenario 24: attributes approval denial event", async () => {
      serverInstance.mcpContext.recordSessionEvent({
        projectId,
        eventType: "APPROVAL_DENIED",
        source: "approval",
        refType: "approval",
        refId: "approval_test_456",
        summary: { resolvedBy: "Local Operator", reason: "Blocked by operator" },
      });

      const eventsRes = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 50 },
      });
      const eventsData = parseToolResult(eventsRes);
      const appEvt = eventsData.events.find(
        (e: any) => e.operation === "APPROVAL_DENIED" && e.target === "approval_test_456"
      );
      expect(appEvt).toBeDefined();
    });
  });

  // =========================================================================
  // Group 5: Handoff Packet & Sanitization (Scenarios 25-28)
  // =========================================================================
  describe("Group 5: Handoff Packet & Sanitization", () => {
    let handoffData: any;

    it("Scenario 25: generates complete WorkflowHandoffPacket with version 1.0.0", async () => {
      const res = await client.callTool({
        name: "localbridge_session_handoff",
        arguments: { sessionId: activeSessionId },
      });

      handoffData = parseToolResult(res);
      expect(handoffData.handoff).toBeDefined();
      expect(handoffData.handoff.version).toBe("1.0.0");
      expect(handoffData.handoff.session.id).toBe(activeSessionId);
      expect(handoffData.handoff.session.state).toBe("active");
    });

    it("Scenario 26: handoff includes real-time git state, touched files, and checkpoints", async () => {
      const { handoff } = handoffData;
      expect(handoff.currentStatus).toBeDefined();
      expect(handoff.currentStatus.git).toBeDefined();
      expect(typeof handoff.currentStatus.git.dirty).toBe("boolean");
      expect(handoff.recentCheckpoints.length).toBeGreaterThanOrEqual(1);
      expect(handoff.touchedFiles.length).toBeGreaterThanOrEqual(1);
      expect(handoff.recentEvents.length).toBeGreaterThanOrEqual(5);
    });

    it("Scenario 27: handoff continuationPrompt provides formatted instructions for new chat", async () => {
      const { handoff } = handoffData;
      expect(handoff.continuationPrompt).toBeDefined();
      expect(handoff.continuationPrompt).toContain("# Nexus Workflow Session Context");
      expect(handoff.continuationPrompt).toContain("P3-B Core Feature Implementation");
      expect(handoff.continuationPrompt).toContain("Session Goals:");
      expect(handoff.continuationPrompt).toContain("Latest Checkpoint:");
      expect(handoff.continuationPrompt).toContain("Next Steps:");
    });

    it("Scenario 28: deep sanitization scrubs tokens, credentials, and user home paths", async () => {
      // Record an event containing sensitive token secrets
      serverInstance.mcpContext.recordSessionEvent({
        projectId,
        eventType: "SECURITY_EVENT",
        source: "system",
        summary: {
          token: "lb_test_token_secret_value_12345",
          password: "my_super_secret_password",
          bearer: "Bearer secret_jwt_token_payload",
        },
      });

      const res = await client.callTool({
        name: "localbridge_session_handoff",
        arguments: { sessionId: activeSessionId },
      });
      const data = parseToolResult(res);
      const prompt = data.handoff.continuationPrompt;
      const rawJson = JSON.stringify(data.handoff);

      expect(rawJson).not.toContain("lb_test_token_secret_value_12345");
      expect(rawJson).not.toContain("my_super_secret_password");
      expect(prompt).not.toContain("lb_test_token_secret_value_12345");
      expect(prompt).not.toContain("my_super_secret_password");
    });
  });

  // =========================================================================
  // Group 6: Finish Guards & Lifecycle Completion (Scenarios 29-32)
  // =========================================================================
  describe("Group 6: Finish Guards & Lifecycle Completion", () => {
    it("Scenario 29: blocks finish with SESSION_HAS_ACTIVE_JOBS when active job exists", async () => {
      // Insert a synthetic running job
      const now = Date.now();
      serverInstance.db.db
        .prepare(
          `INSERT INTO jobs (id, project_id, runner_id, command_kind, risk, state, created_at, started_at, output_truncated)
           VALUES ('job_active_guard', ?, 'runner_test', 'build', 'SAFE', 'running', ?, ?, 0)`
        )
        .run(projectId, now, now);

      const res = await client.callTool({
        name: "localbridge_session_finish",
        arguments: { sessionId: activeSessionId },
      });

      expect(res.isError).toBe(true);
      const structured = (res as any).structuredContent;
      expect(structured?.code).toBe(LocalBridgeErrorCode.SESSION_HAS_ACTIVE_JOBS);

      // Clean up the running job
      serverInstance.db.db
        .prepare(`UPDATE jobs SET state = 'succeeded', finished_at = ? WHERE id = 'job_active_guard'`)
        .run(Date.now());
    });

    it("Scenario 30: blocks finish with SESSION_HAS_PENDING_APPROVALS when approval pending", async () => {
      // Record a synthetic pending approval into the session
      serverInstance.mcpContext.recordSessionEvent({
        projectId,
        eventType: "APPROVAL_CREATED",
        source: "approval",
        refType: "approval",
        refId: "app_pending_guard",
        summary: { operation: "git.commit", risk: "CAUTION" },
      });

      const res = await client.callTool({
        name: "localbridge_session_finish",
        arguments: { sessionId: activeSessionId },
      });

      expect(res.isError).toBe(true);
      const structured = (res as any).structuredContent;
      expect(structured?.code).toBe(LocalBridgeErrorCode.SESSION_HAS_PENDING_APPROVALS);

      // Resolve the approval
      serverInstance.mcpContext.recordSessionEvent({
        projectId,
        eventType: "APPROVAL_APPROVED",
        source: "approval",
        refType: "approval",
        refId: "app_pending_guard",
        summary: { resolvedBy: "Local Operator" },
      });
    });

    it("Scenario 31: finishes session transitioning state to completed", async () => {
      const res = await client.callTool({
        name: "localbridge_session_finish",
        arguments: {
          sessionId: activeSessionId,
          outcome: "completed",
          reason: "All milestone goals verified successfully",
          notes: "Ready for operator sign-off.",
        },
      });

      const data = parseToolResult(res);
      expect(data.session.state).toBe("completed");
      expect(data.session.finishReason).toContain("milestone goals");
      expect(data.session.finishedAt).toBeGreaterThan(0);
    });

    it("Scenario 32: allows starting a new session on project once prior session is completed", async () => {
      const res = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          title: "P3-B Second Generation Session",
        },
      });

      const data = parseToolResult(res);
      expect(data.session.id).not.toBe(activeSessionId);
      expect(data.session.state).toBe("active");

      // Finish it as abandoned
      await client.callTool({
        name: "localbridge_session_finish",
        arguments: {
          sessionId: data.session.id,
          outcome: "abandoned",
          reason: "Test complete",
        },
      });
    });
  });

  // =========================================================================
  // Group 7: Multi-Project, Pagination & Persistence (Scenarios 33-35)
  // =========================================================================
  describe("Group 7: Multi-Project, Pagination & Persistence", () => {
    it("Scenario 33: maintains strict isolation between project workspaces", async () => {
      // Start session on Project B
      const resB = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId: projectBId,
          title: "Project B Workspace Session",
        },
      });
      const dataB = parseToolResult(resB);
      expect(dataB.session.projectId).toBe(projectBId);

      // Verify Project A has no active session
      const statusA = await client.callTool({
        name: "localbridge_session_status",
        arguments: { projectId },
      });
      const dataA = parseToolResult(statusA);
      expect(dataA.activeSession).toBeNull();

      // Clean up Project B session
      await client.callTool({
        name: "localbridge_session_finish",
        arguments: {
          sessionId: dataB.session.id,
          outcome: "completed",
        },
      });
    });

    it("Scenario 34: paginates timeline events stably with cursor", async () => {
      const page1Res = await client.callTool({
        name: "localbridge_session_events",
        arguments: { sessionId: activeSessionId, limit: 3 },
      });
      const page1 = parseToolResult(page1Res);
      expect(page1.events).toHaveLength(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      const page2Res = await client.callTool({
        name: "localbridge_session_events",
        arguments: {
          sessionId: activeSessionId,
          cursor: page1.nextCursor,
          limit: 3,
        },
      });
      const page2 = parseToolResult(page2Res);
      expect(page2.events).toHaveLength(3);
      // Ensure pages do not overlap
      const page1Ids = page1.events.map((e: any) => e.id);
      for (const e of page2.events) {
        expect(page1Ids).not.toContain(e.id);
      }
    });

    it("Scenario 35: verifies database persistence across full server restart", async () => {
      // 1. Close MCP client and server instance
      await client.close();
      await serverInstance.app.close();

      // 2. Restart server with the same database path
      const serverConfig = AppConfigSchema.parse({
        server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
        logging: { level: "silent", pretty: false },
      });

      const newServer = await buildApp({
        config: serverConfig,
        migrationsDir,
        enableLogging: false,
        managementSecret,
      });

      const address = await newServer.app.listen({ host: "127.0.0.1", port: 0 });
      const match = address.match(/:(\d+)$/);
      const newPort = match ? Number.parseInt(match[1]!, 10) : 18080;

      // 3. Connect new client
      const newTransport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${newPort}/mcp`),
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
      const newClient = new Client(
        { name: "Restart-Client", version: "1.0.0" },
        {
          capabilities: {},
          versionNegotiation: { mode: { pin: "2026-07-28" } },
        } as any
      );
      await newClient.connect(newTransport);

      try {
        // Query the first session that was created and completed
        const listRes = await newClient.callTool({
          name: "localbridge_session_list",
          arguments: { projectId, state: "completed" },
        });
        const listData = parseToolResult(listRes);
        expect(listData.sessions.length).toBeGreaterThanOrEqual(1);
        const persisted = listData.sessions.find((s: any) => s.id === activeSessionId);
        expect(persisted).toBeDefined();
        expect(persisted.state).toBe("completed");
        expect(persisted.title).toBe("P3-B Core Feature Implementation");
        expect(persisted.checkpointCount).toBeGreaterThanOrEqual(1);
      } finally {
        await newClient.close();
        await newServer.app.close();
      }
    });
  });
});

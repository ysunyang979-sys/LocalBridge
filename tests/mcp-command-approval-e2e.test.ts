import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/server";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import {
  ExecutableRegistry,
  ProcessRunner,
  CommandExecutionService,
} from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";
import { registerCommandTools } from "../apps/server/src/mcp/tools/command.js";
import { registerJobTools } from "../apps/server/src/mcp/tools/jobs.js";
import { registerApprovalTools } from "../apps/server/src/mcp/tools/approvals.js";

describe("P1-A MCP Command Approval Closed-Loop E2E", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let approvalManager: ApprovalManager;
  let commandService: CommandExecutionService;
  let jobManager: JobManager;
  let projectId: string;

  let mcpServer: McpServer;
  let toolHandlers: Map<string, Function>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-cmd-approval-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    // Setup project with package.json
    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "MCP Approval Test Project",
      accessMode: "read-write",
    });
    projectId = rec.id;
    projectRegistry.setExecutionMode(projectId, "project-code");
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    const pkgJson = {
      name: "mcp-approval-pkg",
      version: "1.0.0",
      scripts: {
        build: "node -v",
      },
    };
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
      "utf-8"
    );

    approvalManager = new ApprovalManager();
    const execRegistry = new ExecutableRegistry();
    const runner = new ProcessRunner();

    commandService = new CommandExecutionService(
      projectRegistry,
      execRegistry,
      runner,
      tempDir,
      undefined,
      approvalManager
    );

    jobManager = new JobManager(
      projectRegistry,
      execRegistry,
      tempDir,
      undefined,
      approvalManager
    );

    // Setup McpServer and mock context
    mcpServer = new McpServer({ name: "test-server", version: "1.0.0" });
    toolHandlers = new Map();

    // Spy on registerTool to capture tool handlers
    const origRegisterTool = mcpServer.registerTool.bind(mcpServer);
    mcpServer.registerTool = ((name: string, config: any, handler: Function) => {
      toolHandlers.set(name, handler);
      return origRegisterTool(name, config, handler as any);
    }) as any;

    const mockContext: any = {
      resolveProjectRunner: () => "runner_test",
      resolveJobRunner: () => "runner_test",
      trackJob: vi.fn(),
      runnerRegistry: {
        list: () => [{ id: "runner_test" }],
      },
      logAudit: vi.fn(),
      request: async (runnerId: string, method: string, params: any) => {
        if (method === RunnerRpcMethods.CommandClassify) {
          return commandService.classify(params);
        }
        if (method === RunnerRpcMethods.CommandRun) {
          return commandService.run(params);
        }
        if (method === RunnerRpcMethods.JobStart) {
          return jobManager.startJob(params);
        }
        if (method === RunnerRpcMethods.BuildStart) {
          return jobManager.startBuild(params);
        }
        if (method === RunnerRpcMethods.TestStart) {
          return jobManager.startTest(params);
        }
        if (method === "approval.get") {
          const app = approvalManager.get(params.approvalId);
          if (!app) return null;
          return {
            id: app.id,
            projectId: app.projectId,
            operation: app.operation,
            risk: app.risk,
            status: app.status,
            summary: app.summary,
            createdAt: app.createdAt,
            expiresAt: app.expiresAt,
            resolvedAt: app.resolvedAt,
          };
        }
        throw new Error(`Unhandled RPC method: ${method}`);
      },
    };

    registerCommandTools(mcpServer, mockContext);
    registerJobTools(mcpServer, mockContext);
    registerApprovalTools(mcpServer, mockContext);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("completes full MCP command closed loop: tools/call -> APPROVAL_REQUIRED -> Approve -> retry with approvalId -> consumed", async () => {
    const cmdRunHandler = toolHandlers.get("localbridge_command_run");
    const approvalStatusHandler = toolHandlers.get("localbridge_approval_status");
    expect(cmdRunHandler).toBeDefined();
    expect(approvalStatusHandler).toBeDefined();

    // Step 1: AI calls localbridge_command_run without approvalId
    const step1Result = await cmdRunHandler!({
      projectId,
      kind: "package-script",
      manager: "pnpm",
      script: "build",
    });

    expect(step1Result.isError).toBe(true);
    expect(step1Result.structuredContent?.code).toBe("APPROVAL_REQUIRED");
    const errText = step1Result.content?.[0]?.text;
    expect(errText).toContain("Operation requires human approval");

    // Extract approvalId from error message or structuredContent
    const approvalId =
      step1Result.structuredContent?.details?.approvalId ||
      errText.match(/approval_[0-9a-f-]{36}/i)?.[0];
    expect(approvalId).toBeDefined();

    // Step 2: Query approval status via localbridge_approval_status
    const statusRes1 = await approvalStatusHandler!({ approvalId });
    expect(statusRes1.isError).toBeFalsy();
    const statusData1 = JSON.parse(statusRes1.content[0].text);
    expect(statusData1.status).toBe("pending");
    expect(statusData1.operation).toBe("command.run");

    // Step 3: Operator approves the request
    const resolveRes = approvalManager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "test-operator",
    });
    expect(resolveRes.status).toBe("approved");

    // Check status is now approved
    const statusRes2 = await approvalStatusHandler!({ approvalId });
    const statusData2 = JSON.parse(statusRes2.content[0].text);
    expect(statusData2.status).toBe("approved");

    // Step 4: AI retries with tampered arguments -> throws APPROVAL_PAYLOAD_MISMATCH
    const tamperedResult = await cmdRunHandler!({
      projectId,
      kind: "package-script",
      manager: "pnpm",
      script: "build",
      args: ["--tampered-arg"],
      approvalId,
    });
    expect(tamperedResult.isError).toBe(true);
    expect(tamperedResult.structuredContent?.code).toBe("APPROVAL_PAYLOAD_MISMATCH");

    // Step 5: AI retries with original arguments + approvalId -> SUCCESS
    const step5Result = await cmdRunHandler!({
      projectId,
      kind: "package-script",
      manager: "pnpm",
      script: "build",
      approvalId,
    });
    expect(step5Result.isError).toBeFalsy();
    const successData = JSON.parse(step5Result.content[0].text);
    expect(successData.exitCode).toBe(0);
    expect(successData.stdout).toContain("v");

    // Step 6: Verify approval status is now consumed
    const consumedApproval = approvalManager.get(approvalId);
    expect(consumedApproval?.status).toBe("consumed");

    // Step 7: AI replays same approvalId -> fails with APPROVAL_ALREADY_RESOLVED
    const replayResult = await cmdRunHandler!({
      projectId,
      kind: "package-script",
      manager: "pnpm",
      script: "build",
      approvalId,
    });
    expect(replayResult.isError).toBe(true);
    expect(replayResult.structuredContent?.code).toBe("APPROVAL_ALREADY_RESOLVED");
  });

  it("completes full MCP job.start closed loop with approvalId", async () => {
    const jobStartHandler = toolHandlers.get("localbridge_job_start");
    expect(jobStartHandler).toBeDefined();

    // Step 1: AI calls localbridge_job_start without approvalId
    const step1Result = await jobStartHandler!({
      command: {
        projectId,
        kind: "package-script",
        manager: "pnpm",
        script: "build",
      },
    });

    expect(step1Result.isError).toBe(true);
    expect(step1Result.structuredContent?.code).toBe("APPROVAL_REQUIRED");
    const errText = step1Result.content?.[0]?.text;
    expect(errText).toContain("Operation requires human approval");

    const approvalId =
      step1Result.structuredContent?.details?.approvalId ||
      errText.match(/approval_[0-9a-f-]{36}/i)?.[0];
    expect(approvalId).toBeDefined();

    // Step 2: Operator approves
    approvalManager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "test-operator",
    });

    // Step 3: AI retries with approvalId
    const step3Result = await jobStartHandler!({
      command: {
        projectId,
        kind: "package-script",
        manager: "pnpm",
        script: "build",
      },
      approvalId,
    });

    expect(step3Result.isError).toBeFalsy();
    const successData = JSON.parse(step3Result.content[0].text);
    expect(successData.jobId).toBeDefined();
    expect(successData.state).toBeDefined();

    // Verify approval consumed
    expect(approvalManager.get(approvalId)?.status).toBe("consumed");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandSpec,
} from "@localbridge/protocol";
import { CommandClassifier, CommandPolicy } from "@localbridge/security";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import {
  ExecutableRegistry,
  ProcessRunner,
  CommandExecutionService,
} from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";
import { buildSafeProcessEnv } from "../apps/runner/src/process/environment.js";

describe("P1-A: Unified Command Policy & Approval Control E2E", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let approvalManager: ApprovalManager;
  let commandService: CommandExecutionService;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-cmd-policy-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Command Policy Test Project",
      accessMode: "read-write",
    });
    projectId = rec.id;
    projectRegistry.setExecutionMode(projectId, "project-code");

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
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 1. Safe inspect -> ALLOW
  it("allows safe inspect command (tool-version) automatically", async () => {
    const spec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(0);
    expect(result.risk).toBe("SAFE");
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  // 2. Test -> ALLOW by default under safe development
  it("allows test script command execution by default", async () => {
    const testFile = path.join(projectDir, "my-test.js");
    fs.writeFileSync(testFile, "console.log('test-passed');\n", "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "my-test.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("test-passed");
  });

  // 3. Dev server -> ASK by default
  it("requires approval for dev-server script by default (ASK)", async () => {
    const pkgJson = {
      name: "dev-server-pkg",
      version: "1.0.0",
      scripts: {
        dev: "node -v",
      },
    };
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
      "utf-8"
    );

    const spec: CommandSpec = {
      kind: "package-script",
      projectId,
      manager: "pnpm",
      script: "dev",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    try {
      await commandService.run(spec);
      expect.unreachable("Should have thrown APPROVAL_REQUIRED");
    } catch (err) {
      expect(err).toBeInstanceOf(LocalBridgeError);
      const lbErr = err as LocalBridgeError;
      expect(lbErr.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      expect(lbErr.details?.approvalId).toBeDefined();
    }
  });

  // 4. Raw shell -> DENY
  it("strictly denies raw shell invocations (cmd.exe /c, bash -c, powershell -Command)", async () => {
    const scriptFile = path.join(projectDir, "dummy.js");
    fs.writeFileSync(scriptFile, "console.log('shell-attempt');\n", "utf-8");

    // Attempt with cmd.exe /c as args
    const specCmd: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "dummy.js",
      args: ["cmd.exe", "/c", "dir"],
      cwd: ".",
    };

    await expect(commandService.run(specCmd)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(specCmd);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_BLOCKED);
    }

    // Attempt with bash -c as args
    const specBash: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "dummy.js",
      args: ["bash", "-c", "whoami"],
      cwd: ".",
    };

    await expect(commandService.run(specBash)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(specBash);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_BLOCKED);
    }
  });

  // 5. CWD boundary escape -> DENY
  it("strictly denies cwd escaping outside project canonical root", async () => {
    const scriptFile = path.join(projectDir, "safe.js");
    fs.writeFileSync(scriptFile, "console.log('safe');\n", "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "safe.js",
      args: [],
      cwd: "../../..",
    };

    await expect(commandService.run(spec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(spec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY);
    }
  });

  // 6. Read-only project + build/install -> DENY
  it("denies write-modifying commands (build) when project is in read-only mode", async () => {
    projectRegistry.setAccessMode(projectId, "read-only");

    const pkgJson = {
      name: "readonly-pkg",
      version: "1.0.0",
      scripts: {
        build: "echo build",
      },
    };
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
      "utf-8"
    );

    const spec: CommandSpec = {
      kind: "package-script",
      projectId,
      manager: "pnpm",
      script: "build",
      args: [],
      cwd: ".",
    };

    await expect(commandService.run(spec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(spec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(
        LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS
      );
    }
  });

  // 7. Approval closed loop: ASK -> APPROVAL_REQUIRED -> Approve -> Execute -> Replay fails -> Tamper fails
  it("executes full approval closed-loop: ASK -> Approve -> Retry -> Replay/Tamper denied", async () => {
    const pkgJson = {
      name: "approval-pkg",
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

    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    const spec: CommandSpec = {
      kind: "package-script",
      projectId,
      manager: "pnpm",
      script: "build",
      args: ["--param1"],
      cwd: ".",
      timeoutMs: 10000,
    };

    // Step 1: Initial invocation triggers APPROVAL_REQUIRED
    let approvalId = "";
    try {
      await commandService.run(spec);
      expect.unreachable("Should have triggered approval");
    } catch (err) {
      expect(err).toBeInstanceOf(LocalBridgeError);
      const lbErr = err as LocalBridgeError;
      expect(lbErr.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      approvalId = lbErr.details?.approvalId as string;
      expect(approvalId).toBeDefined();
    }

    // Step 2: Operator approves the request
    approvalManager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "test-operator",
    });

    // Step 3: Tampered arguments fail with APPROVAL_PAYLOAD_MISMATCH
    const tamperedSpec = {
      ...spec,
      args: ["--tampered-arg"],
      approvalId,
    };
    await expect(commandService.run(tamperedSpec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(tamperedSpec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH);
    }

    // Step 4: Tampered cwd fails with APPROVAL_PAYLOAD_MISMATCH
    const subDir = path.join(projectDir, "sub");
    fs.mkdirSync(subDir, { recursive: true });
    const tamperedCwdSpec = {
      ...spec,
      cwd: "sub",
      approvalId,
    };
    await expect(commandService.run(tamperedCwdSpec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(tamperedCwdSpec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH);
    }

    // Step 5: Retry with original params succeeds and executes
    const validRetrySpec = {
      ...spec,
      approvalId,
    };
    const execResult = await commandService.run(validRetrySpec);
    expect(execResult.exitCode).toBe(0);

    // Step 6: Replay of consumed approval fails with APPROVAL_ALREADY_RESOLVED
    await expect(commandService.run(validRetrySpec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(validRetrySpec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED);
    }
  });

  // 8. Emergency Stop -> DENY
  it("denies all command execution when emergency stop is active", () => {
    const spec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    const decision = CommandPolicy.evaluateUnified({
      projectId,
      spec,
      projectEnabled: true,
      projectAccessMode: "read-write",
      executionMode: "project-code",
      isEmergencyStopped: true,
    });

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("Emergency stop is active");
  });

  // 9. Pause AI -> DENY
  it("denies all command execution when AI operations are paused", () => {
    const spec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    const decision = CommandPolicy.evaluateUnified({
      projectId,
      spec,
      projectEnabled: true,
      projectAccessMode: "read-write",
      executionMode: "project-code",
      isAiPaused: true,
    });

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("AI access is paused");
  });

  // 10. Legacy execution mode migration -> fail-safe, no privilege escalation
  it("migrates legacy execution modes fail-safe without privilege escalation", () => {
    const scriptSpec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "test.js",
    };

    // Disabled mode blocks everything
    const disabledDecision = CommandPolicy.evaluateUnified({
      projectId,
      spec: scriptSpec,
      projectEnabled: true,
      projectAccessMode: "read-write",
      executionMode: "disabled",
    });
    expect(disabledDecision.decision).toBe("deny");

    // Safe-only mode blocks scripts
    const safeOnlyDecision = CommandPolicy.evaluateUnified({
      projectId,
      spec: scriptSpec,
      projectEnabled: true,
      projectAccessMode: "read-write",
      executionMode: "safe-only",
    });
    expect(safeOnlyDecision.decision).toBe("deny");

    // Safe-only mode allows tool-version
    const versionSpec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };
    const safeVersionDecision = CommandPolicy.evaluateUnified({
      projectId,
      spec: versionSpec,
      projectEnabled: true,
      projectAccessMode: "read-write",
      executionMode: "safe-only",
    });
    expect(safeVersionDecision.decision).toBe("allow");
  });

  // 11. Custom command policy per project -> verified
  it("enforces per-project custom command policy rules", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "custom",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        commands: {
          test: "allow",
          lint: "allow",
          build: "deny",
          packageInstall: "deny",
        },
      },
    });

    const pkgJson = {
      name: "custom-policy-pkg",
      version: "1.0.0",
      scripts: {
        build: "echo building",
      },
    };
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(pkgJson, null, 2),
      "utf-8"
    );

    // Build is configured to deny
    const buildSpec: CommandSpec = {
      kind: "package-script",
      projectId,
      manager: "pnpm",
      script: "build",
    };

    await expect(commandService.run(buildSpec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(buildSpec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_BLOCKED);
    }
  });

  // 12. Environment security: forbid overriding critical and sensitive variables
  it("throws COMMAND_INVALID_ENV when trying to override protected environment variables", () => {
    // Overriding PATH
    expect(() => {
      buildSafeProcessEnv(tempDir, { PATH: "C:\\malicious\\bin" });
    }).toThrowError(LocalBridgeError);
    try {
      buildSafeProcessEnv(tempDir, { PATH: "C:\\malicious\\bin" });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_INVALID_ENV);
    }

    // Overriding OPENAI_API_KEY
    expect(() => {
      buildSafeProcessEnv(tempDir, { OPENAI_API_KEY: "sk-fake" });
    }).toThrowError(LocalBridgeError);

    // Overriding LB_RUNNER_SECRET
    expect(() => {
      buildSafeProcessEnv(tempDir, { LB_RUNNER_SECRET: "leak" });
    }).toThrowError(LocalBridgeError);

    // Overriding COMSPEC
    expect(() => {
      buildSafeProcessEnv(tempDir, { COMSPEC: "cmd.exe" });
    }).toThrowError(LocalBridgeError);
  });

  // 13. Background Job Manager integration with approval closed loop
  it("integrates JobManager with approval closed-loop for background jobs", async () => {
    const pkgJson = {
      name: "job-pkg",
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

    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    // startBuild triggers approval for build script
    let approvalId = "";
    try {
      await jobManager.startBuild({
        projectId,
        script: "build",
      });
      expect.unreachable("startBuild should require approval");
    } catch (err) {
      expect(err).toBeInstanceOf(LocalBridgeError);
      const lbErr = err as LocalBridgeError;
      expect(lbErr.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      approvalId = lbErr.details?.approvalId as string;
      expect(approvalId).toBeDefined();
    }

    // Approve
    approvalManager.resolve({
      approvalId,
      action: "approve",
      resolvedBy: "test-operator",
    });

    // Retry with approvalId
    const jobResult = await jobManager.startBuild({
      projectId,
      script: "build",
      approvalId,
    });
    expect(jobResult.jobId).toBeDefined();
    expect(jobResult.state).toBe("running");
  });

  // 14. Project executionMode = project-code with commandPolicy = controlled triggers APPROVAL_REQUIRED on build
  it("triggers APPROVAL_REQUIRED for 'pnpm run build' when executionMode is project-code and commandPolicy is controlled (Safe Development)", async () => {
    const pkgJson = {
      name: "myweb-test",
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

    projectRegistry.setExecutionMode(projectId, "project-code");
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
    });

    const spec: CommandSpec = {
      kind: "package-script",
      projectId,
      manager: "pnpm",
      script: "build",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    try {
      await commandService.run(spec);
      expect.unreachable("Build command should require approval under controlled policy");
    } catch (err) {
      expect(err).toBeInstanceOf(LocalBridgeError);
      const lbErr = err as LocalBridgeError;
      expect(lbErr.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      expect(lbErr.details?.approvalId).toBeDefined();
    }
  });
});

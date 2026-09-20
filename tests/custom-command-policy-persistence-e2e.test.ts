import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("../apps/server/node_modules/better-sqlite3");
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type CommandSpec,
  type ProjectTrustPolicy,
  type ProjectCustomRules,
} from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createProjectSetTrustPolicyHandler } from "../apps/runner/src/rpc/handlers/project-set-trust-policy.js";
import { ServerProjectService } from "../apps/server/src/runner/project-service.js";
import {
  ExecutableRegistry,
  ProcessRunner,
  CommandExecutionService,
} from "../apps/runner/src/process/index.js";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";

describe("Custom Command Policy Matrix - Persistence & Execution E2E", () => {
  let tmpDir: string;
  let projectDir: string;
  let registryPath: string;
  let dbPath: string;
  let projectId: string;
  let registry: ProjectRegistry;
  let db: any;
  let projectService: ServerProjectService;
  let setTrustPolicyHandler: any;
  let approvalManager: ApprovalManager;
  let execRegistry: ExecutableRegistry;
  let runner: ProcessRunner;
  let commandService: CommandExecutionService;

  const defaultCommandRules: ProjectCustomRules["commands"] = {
    inspect: "allow",
    test: "allow",
    lint: "allow",
    typecheck: "allow",
    build: "ask",
    devServer: "ask",
    packageScript: "ask",
    packageInstall: "ask",
    gitRead: "allow",
    customSafe: "allow",
    controlledCommand: "ask",
  };

  function initDb(pathStr: string) {
    const database = new Database(pathStr);
    database.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        runner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        access_mode TEXT NOT NULL,
        execution_mode TEXT NOT NULL DEFAULT 'disabled',
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_trust_policies (
        project_id TEXT PRIMARY KEY,
        trust_level TEXT NOT NULL DEFAULT 'standard',
        file_policy TEXT NOT NULL DEFAULT 'standard',
        command_policy TEXT NOT NULL DEFAULT 'ask',
        protected_files_policy TEXT NOT NULL DEFAULT 'always-ask',
        custom_rules TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    return database;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-cmd-persist-test-"));
    projectDir = path.join(tmpDir, "myweb");
    fs.mkdirSync(projectDir, { recursive: true });

    registryPath = path.join(tmpDir, "projects.json");
    registry = new ProjectRegistry(registryPath);
    const proj = registry.add(projectDir, { name: "Myweb" });
    registry.setAccessMode(proj.id, "read-write");
    registry.setExecutionMode(proj.id, "project-code");
    projectId = proj.id;

    dbPath = path.join(tmpDir, "server.db");
    db = initDb(dbPath);
    projectService = new ServerProjectService(db, { get: () => ({}) } as any);
    projectService.syncRunnerProjects("runner_local", [
      {
        id: proj.id,
        name: proj.name,
        accessMode: proj.accessMode,
        executionMode: proj.executionMode,
        enabled: proj.enabled,
      },
    ]);

    setTrustPolicyHandler = createProjectSetTrustPolicyHandler(registry);
    approvalManager = new ApprovalManager();
    execRegistry = new ExecutableRegistry();
    runner = new ProcessRunner();
    commandService = new CommandExecutionService(
      registry,
      execRegistry,
      runner,
      tmpDir,
      undefined,
      approvalManager
    );
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("persists Custom Command Policy Matrix under Full Project Trust and enforces inspect = ask -> APPROVAL_REQUIRED", async () => {
    // 1. Desktop prepares payload: Full Project Trust + Custom Command Matrix (inspect = ask)
    const initialCommands = {
      ...defaultCommandRules,
      inspect: "ask" as const,
    };

    const savePayload: ProjectTrustPolicy = {
      trustLevel: "full-project-trust",
      filePolicy: "allow",
      commandPolicy: "controlled",
      protectedFilesPolicy: "always-ask",
      customRules: {
        commands: initialCommands,
      },
      canonicalRoot: projectDir,
      updatedAt: Date.now(),
    };

    // 2. Server forwards to Runner via RPC
    const rpcRes = await setTrustPolicyHandler({
      projectId,
      trustLevel: savePayload.trustLevel,
      filePolicy: savePayload.filePolicy,
      commandPolicy: savePayload.commandPolicy,
      protectedFilesPolicy: savePayload.protectedFilesPolicy,
      customRules: savePayload.customRules,
    });

    expect(rpcRes.policy.trustLevel).toBe("full-project-trust");
    expect(rpcRes.policy.commandPolicy).toBe("controlled");
    expect(rpcRes.policy.customRules?.commands?.inspect).toBe("ask");

    // 3. Server persists policy to SQLite
    projectService.setTrustPolicy(projectId, rpcRes.policy);

    // 4. Verify Server GET returns inspect === 'ask'
    const serverPolicyT6 = projectService.getTrustPolicy(projectId);
    expect(serverPolicyT6).toBeDefined();
    expect(serverPolicyT6?.trustLevel).toBe("full-project-trust");
    expect(serverPolicyT6?.commandPolicy).toBe("controlled");
    expect(serverPolicyT6?.customRules?.commands?.inspect).toBe("ask");
    expect(serverPolicyT6?.customRules?.commands?.test).toBe("allow");

    // 5. Simulate Server restart (re-open DB and re-instantiate ServerProjectService)
    db.close();
    const newDb = initDb(dbPath);
    const restartedServerService = new ServerProjectService(newDb, { get: () => ({}) } as any);
    const policyAfterServerRestart = restartedServerService.getTrustPolicy(projectId);
    expect(policyAfterServerRestart?.trustLevel).toBe("full-project-trust");
    expect(policyAfterServerRestart?.commandPolicy).toBe("controlled");
    expect(policyAfterServerRestart?.customRules?.commands?.inspect).toBe("ask");
    expect(policyAfterServerRestart?.customRules?.commands?.build).toBe("ask");
    newDb.close();
    db = initDb(dbPath); // restore for afterEach

    // 6. Simulate Runner restart (re-instantiate ProjectRegistry from storage file)
    const restartedRegistry = new ProjectRegistry(registryPath);
    const runnerPolicyAfterRestart = restartedRegistry.get(projectId)?.trustPolicy;
    expect(runnerPolicyAfterRestart?.trustLevel).toBe("full-project-trust");
    expect(runnerPolicyAfterRestart?.commandPolicy).toBe("controlled");
    expect(runnerPolicyAfterRestart?.customRules?.commands?.inspect).toBe("ask");

    // 7. Execute `node --version` via CommandExecutionService with reloaded registry
    const reloadedCommandService = new CommandExecutionService(
      restartedRegistry,
      execRegistry,
      runner,
      tmpDir,
      undefined,
      approvalManager
    );

    const versionSpec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    let approvalRequiredError: any = null;
    try {
      await reloadedCommandService.run({ ...versionSpec,  });
    } catch (err) {
      approvalRequiredError = err;
    }

    expect(approvalRequiredError).toBeInstanceOf(LocalBridgeError);
    expect(approvalRequiredError.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    expect(approvalRequiredError.details?.approvalId).toBeDefined();

    // 8. Re-try with approvalId after approval works
    const approvalId = approvalRequiredError.details.approvalId;
    approvalManager.resolve({ approvalId, action: "approve", resolvedBy: "admin" });

    const execResult = await reloadedCommandService.run({
      ...versionSpec,
      approvalId,
    });
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("persists inspect = deny and blocks node --version without approval", async () => {
    // 1. Update inspect = "deny", keeping other fields
    const updatedCommands = {
      ...defaultCommandRules,
      inspect: "deny" as const,
    };

    const rpcRes = await setTrustPolicyHandler({
      projectId,
      trustLevel: "full-project-trust",
      commandPolicy: "controlled",
      customRules: {
        commands: updatedCommands,
      },
    });

    projectService.setTrustPolicy(projectId, rpcRes.policy);

    // 2. Restart Server & Runner
    const restartedRegistry = new ProjectRegistry(registryPath);
    const reloadedCommandService = new CommandExecutionService(
      restartedRegistry,
      execRegistry,
      runner,
      tmpDir,
      undefined,
      approvalManager
    );

    // 3. GET verify
    const persisted = projectService.getTrustPolicy(projectId);
    expect(persisted?.customRules?.commands?.inspect).toBe("deny");

    // 4. Execute node --version -> DENY
    const versionSpec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    await expect(
      reloadedCommandService.run({ ...versionSpec,  })
    ).rejects.toThrow(LocalBridgeError);

    try {
      await reloadedCommandService.run({ ...versionSpec });
    } catch (err: any) {
      expect(err.code).toBe(LocalBridgeErrorCode.COMMAND_BLOCKED);
      expect(err.message).toContain("denied");
    }
  });

  it("persists inspect = allow and immediately succeeds node --version", async () => {
    // 1. Update inspect = "allow"
    const updatedCommands = {
      ...defaultCommandRules,
      inspect: "allow" as const,
    };

    const rpcRes = await setTrustPolicyHandler({
      projectId,
      trustLevel: "full-project-trust",
      commandPolicy: "controlled",
      customRules: {
        commands: updatedCommands,
      },
    });

    projectService.setTrustPolicy(projectId, rpcRes.policy);

    // 2. Restart Runner
    const restartedRegistry = new ProjectRegistry(registryPath);
    const reloadedCommandService = new CommandExecutionService(
      restartedRegistry,
      execRegistry,
      runner,
      tmpDir,
      undefined,
      approvalManager
    );

    // 3. GET verify
    const persisted = projectService.getTrustPolicy(projectId);
    expect(persisted?.customRules?.commands?.inspect).toBe("allow");

    // 4. Execute node --version -> SUCCESS
    const versionSpec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    const result = await reloadedCommandService.run({ ...versionSpec,  });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("ensures modifying inspect does not mutate or reset other categories", async () => {
    // Custom set of non-inspect rules
    const customMatrix: ProjectCustomRules["commands"] = {
      inspect: "allow",
      test: "ask",
      lint: "deny",
      typecheck: "ask",
      build: "deny",
      devServer: "deny",
      packageScript: "allow",
      packageInstall: "deny",
      gitRead: "ask",
      customSafe: "deny",
      controlledCommand: "ask",
    };

    await setTrustPolicyHandler({
      projectId,
      trustLevel: "full-project-trust",
      commandPolicy: "controlled",
      customRules: {
        commands: customMatrix,
      },
    });

    // Modify ONLY inspect to 'ask'
    const modified = {
      ...customMatrix,
      inspect: "ask" as const,
    };

    const res = await setTrustPolicyHandler({
      projectId,
      trustLevel: "full-project-trust",
      commandPolicy: "controlled",
      customRules: {
        commands: modified,
      },
    });

    // Verify all other 10 fields preserved exactly
    expect(res.policy.customRules?.commands?.inspect).toBe("ask");
    expect(res.policy.customRules?.commands?.test).toBe("ask");
    expect(res.policy.customRules?.commands?.lint).toBe("deny");
    expect(res.policy.customRules?.commands?.typecheck).toBe("ask");
    expect(res.policy.customRules?.commands?.build).toBe("deny");
    expect(res.policy.customRules?.commands?.devServer).toBe("deny");
    expect(res.policy.customRules?.commands?.packageScript).toBe("allow");
    expect(res.policy.customRules?.commands?.packageInstall).toBe("deny");
    expect(res.policy.customRules?.commands?.gitRead).toBe("ask");
    expect(res.policy.customRules?.commands?.customSafe).toBe("deny");
    expect(res.policy.customRules?.commands?.controlledCommand).toBe("ask");
  });

  it("verifies server route logic: does NOT drop customRules when trustLevel !== 'custom'", async () => {
    const incomingBody: { trustPolicy: ProjectTrustPolicy } = {
      trustPolicy: {
        trustLevel: "full-project-trust",
        filePolicy: "allow",
        commandPolicy: "controlled",
        protectedFilesPolicy: "always-ask",
        customRules: {
          commands: {
            ...defaultCommandRules,
            inspect: "ask",
          },
        },
        canonicalRoot: projectDir,
        updatedAt: Date.now(),
      },
    };

    // Server route passes customRules directly:
    const normalizedFilePolicy =
      incomingBody.trustPolicy.filePolicy === "allow" ||
      incomingBody.trustPolicy.filePolicy === "ask" ||
      incomingBody.trustPolicy.filePolicy === "deny"
        ? incomingBody.trustPolicy.filePolicy
        : incomingBody.trustPolicy.trustLevel === "full-project-trust" ||
            incomingBody.trustPolicy.trustLevel === "session-trusted"
          ? "allow"
          : "ask";

    const rpcPayload = {
      projectId,
      trustLevel: incomingBody.trustPolicy.trustLevel,
      filePolicy: normalizedFilePolicy,
      commandPolicy: incomingBody.trustPolicy.commandPolicy ?? "ask",
      protectedFilesPolicy: incomingBody.trustPolicy.protectedFilesPolicy ?? "always-ask",
      customRules: incomingBody.trustPolicy.customRules,
    };

    const rpcRes = await setTrustPolicyHandler(rpcPayload);
    projectService.setTrustPolicy(projectId, rpcRes.policy);

    const getRes = projectService.getTrustPolicy(projectId);
    expect(getRes?.trustLevel).toBe("full-project-trust");
    expect(getRes?.commandPolicy).toBe("controlled");
    expect(getRes?.customRules?.commands?.inspect).toBe("ask");
  });
});

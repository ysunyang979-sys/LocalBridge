import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode, type CommandSpec } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import {
  ExecutableRegistry,
  ProcessRunner,
  CommandExecutionService,
} from "../apps/runner/src/process/index.js";

describe("Phase 8 - Command Execution Engine Integration", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let commandService: CommandExecutionService;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-exec-engine-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Exec Engine Project",
      accessMode: "read-write",
    });
    projectId = rec.id;

    const execRegistry = new ExecutableRegistry();
    const runner = new ProcessRunner();
    commandService = new CommandExecutionService(
      projectRegistry,
      execRegistry,
      runner,
      tempDir
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("blocks all execution when project executionMode is 'disabled'", async () => {
    projectRegistry.setExecutionMode(projectId, "disabled");

    const spec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    await expect(commandService.run(spec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(spec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.PROJECT_EXECUTION_DISABLED);
    }
  });

  it("allows tool-version but blocks scripts in 'safe-only' mode", async () => {
    projectRegistry.setExecutionMode(projectId, "safe-only");

    // 1. tool-version should succeed
    const versionSpec: CommandSpec = {
      kind: "tool-version",
      projectId,
      tool: "node",
    };

    const versionResult = await commandService.run(versionSpec);
    expect(versionResult.exitCode).toBe(0);
    expect(versionResult.risk).toBe("SAFE");
    expect(versionResult.stdout).toMatch(/v?24\./);

    // 2. node-script should be blocked with COMMAND_BLOCKED
    const scriptPath = path.join(projectDir, "test.js");
    fs.writeFileSync(scriptPath, "console.log('hi');\n", "utf-8");

    const scriptSpec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "test.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    await expect(commandService.run(scriptSpec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(scriptSpec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_BLOCKED);
    }
  });

  it("executes tool-version for node, npm, and pnpm in 'safe-only' mode", async () => {
    projectRegistry.setExecutionMode(projectId, "safe-only");

    for (const tool of ["node", "npm", "pnpm"] as const) {
      const spec: CommandSpec = {
        kind: "tool-version",
        projectId,
        tool,
      };

      const result = await commandService.run(spec);
      expect(result.exitCode).toBe(0);
      expect(result.risk).toBe("SAFE");
      expect(result.stdout.trim().length).toBeGreaterThan(0);
    }
  });

  it("executes node-script with arguments and captures stdout", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    const scriptPath = path.join(projectDir, "greet.js");
    fs.writeFileSync(scriptPath, "console.log('Hello ' + process.argv[2]);\n", "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "greet.js",
      args: ["World"],
      cwd: ".",
      timeoutMs: 5000,
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(0);
    expect(result.risk).toBe("CAUTION");
    expect(result.stdout.trim()).toBe("Hello World");
    expect(result.timedOut).toBe(false);
  });

  it("executes node-script with Chinese and emojis correctly", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    const scriptPath = path.join(projectDir, "unicode.js");
    fs.writeFileSync(scriptPath, "console.log('你好，本地桥梁！🚀');\n", "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "unicode.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("你好，本地桥梁！🚀");
  });

  it("captures non-zero exitCode and stderr without throwing bridge error", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    const scriptPath = path.join(projectDir, "fail.js");
    fs.writeFileSync(
      scriptPath,
      "console.error('Custom script error occurred'); process.exit(42);\n",
      "utf-8"
    );

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "fail.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(42);
    expect(result.stderr.trim()).toBe("Custom script error occurred");
  });

  it("executes script in relative cwd and enforces cwd bounds", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    const subDir = path.join(projectDir, "sub");
    fs.mkdirSync(subDir, { recursive: true });

    const scriptPath = path.join(subDir, "check-cwd.js");
    // Prints cwd basename
    fs.writeFileSync(
      scriptPath,
      "const path = require('node:path'); console.log(path.basename(process.cwd()));\n",
      "utf-8"
    );

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "sub/check-cwd.js",
      args: [],
      cwd: "sub",
      timeoutMs: 5000,
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("sub");
  });

  it("blocks script execution when script resolves to sensitive location", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    const gitDir = path.join(projectDir, ".git", "hooks");
    fs.mkdirSync(gitDir, { recursive: true });
    const hookPath = path.join(gitDir, "pre-commit.js");
    fs.writeFileSync(hookPath, "console.log('hook');\n", "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: ".git/hooks/pre-commit.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    await expect(commandService.run(spec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(spec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED);
    }
  });

  it("executes package-script defined in package.json", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    // Write a test helper script and package.json
    fs.writeFileSync(
      path.join(projectDir, "runner-helper.js"),
      "console.log('package runner working: ' + process.argv[2]);\n",
      "utf-8"
    );

    const pkgJson = {
      name: "test-pkg",
      version: "1.0.0",
      scripts: {
        hello: "node runner-helper.js package-param",
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
      script: "hello",
      args: [],
      cwd: ".",
      timeoutMs: 15000,
    };

    const result = await commandService.run(spec);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("package runner working: package-param");
  }, 20000);

  it("blocks package-script when script does not exist in package.json", async () => {
    projectRegistry.setExecutionMode(projectId, "project-code");

    const pkgJson = {
      name: "test-pkg",
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

    const spec: CommandSpec = {
      kind: "package-script",
      projectId,
      manager: "pnpm",
      script: "nonexistent",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    await expect(commandService.run(spec)).rejects.toThrowError(LocalBridgeError);
    try {
      await commandService.run(spec);
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND);
    }
  });
});

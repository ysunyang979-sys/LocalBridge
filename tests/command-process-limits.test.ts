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

describe("Phase 8 - Command Process Limits & Bounded Execution", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let commandService: CommandExecutionService;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-limits-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Limits Test Project",
      accessMode: "read-write",
    });
    projectRegistry.setExecutionMode(rec.id, "project-code");
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

  it("terminates process and throws COMMAND_TIMEOUT when execution exceeds timeoutMs", async () => {
    const sleepScript = path.join(projectDir, "sleep.js");
    fs.writeFileSync(
      sleepScript,
      "setTimeout(() => { console.log('Done sleeping'); }, 15000);\n",
      "utf-8"
    );

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "sleep.js",
      args: [],
      cwd: ".",
      timeoutMs: 1000, // 1 second timeout
    };

    let caughtError: LocalBridgeError | null = null;
    try {
      await commandService.run(spec);
    } catch (err) {
      caughtError = err as LocalBridgeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe(LocalBridgeErrorCode.COMMAND_TIMEOUT);
  }, 10000);

  it("terminates process and throws COMMAND_OUTPUT_TOO_LARGE when stdout exceeds 256 KiB", async () => {
    const overflowScript = path.join(projectDir, "overflow.js");
    // Write 300 KiB of data to stdout
    fs.writeFileSync(
      overflowScript,
      "process.stdout.write('A'.repeat(300 * 1024));\n",
      "utf-8"
    );

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "overflow.js",
      args: [],
      cwd: ".",
      timeoutMs: 10000,
    };

    let caughtError: LocalBridgeError | null = null;
    try {
      await commandService.run(spec);
    } catch (err) {
      caughtError = err as LocalBridgeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe(LocalBridgeErrorCode.COMMAND_OUTPUT_TOO_LARGE);
  }, 10000);

  it("rejects command when an argument exceeds 4096 bytes", async () => {
    const hugeArg = "X".repeat(5000);
    const scriptPath = path.join(projectDir, "test.js");
    fs.writeFileSync(scriptPath, "console.log('ok');\n", "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "test.js",
      args: [hugeArg],
      cwd: ".",
      timeoutMs: 5000,
    };

    let caughtError: LocalBridgeError | null = null;
    try {
      await commandService.run(spec);
    } catch (err) {
      caughtError = err as LocalBridgeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe(LocalBridgeErrorCode.COMMAND_ARGUMENTS_TOO_LARGE);
  });
});

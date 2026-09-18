import fs from "node:fs";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandClassifyParams,
  type CommandClassifyResult,
  type CommandRunParams,
  type CommandRunResult,
} from "@localbridge/protocol";
import {
  CommandClassifier,
  CommandPolicy,
  validateCommandArguments,
  resolveProjectPath,
  SecurityPathError,
} from "@localbridge/security";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import type { ExecutableRegistry } from "./executable-registry.js";
import type { ProcessRunner } from "./runner.js";
import { buildSafeProcessEnv } from "./environment.js";

export class CommandExecutionService {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly executableRegistry: ExecutableRegistry,
    private readonly processRunner: ProcessRunner,
    private readonly runnerStateDir: string,
    private readonly logger?: Logger
  ) {}

  /**
   * Classify the risk profile of a command specification without executing it.
   */
  async classify(params: CommandClassifyParams): Promise<CommandClassifyResult> {
    this.logger?.debug({ params }, "Classifying command risk");
    const assessment = CommandClassifier.classify(params);
    const project = this.projectRegistry.get(params.projectId);
    const decision = project
      ? CommandPolicy.evaluate(project.executionMode, project.accessMode, assessment)
      : { allowed: false, reason: `Project '${params.projectId}' not found` };

    return {
      risk: assessment.risk,
      reasons: assessment.reasons,
      executesProjectCode: assessment.executesProjectCode,
      mayModifyFiles: assessment.mayModifyFiles,
      mayAccessNetwork: assessment.mayAccessNetwork,
      allowed: decision.allowed,
      ...(decision.reason ? { reason: decision.reason } : {}),
    };
  }

  /**
   * Execute a structured command subject to project execution authorization,
   * risk classification policy, sandboxing, and resource limits.
   */
  async run(params: CommandRunParams): Promise<CommandRunResult> {
    this.logger?.debug({ params }, "Evaluating and running command");

    // 1. Verify project exists
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${params.projectId}' not found in Runner project registry`
      );
    }

    // 2. Validate argument bounds if args are present
    if ("args" in params && Array.isArray(params.args)) {
      const validation = validateCommandArguments(params.args);
      if (!validation.valid) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_ARGUMENTS_TOO_LARGE,
          validation.reason || "Command arguments exceed allowed limits"
        );
      }
    }

    // 3. Classify risk and evaluate execution policy
    const assessment = CommandClassifier.classify(params);
    const decision = CommandPolicy.evaluate(
      project.executionMode,
      project.accessMode,
      assessment
    );

    if (!decision.allowed) {
      if (
        decision.requiredAccessMode === "read-write" &&
        project.accessMode !== "read-write"
      ) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS,
          decision.reason || "Project execution requires write access"
        );
      }

      if (project.executionMode === "disabled") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_EXECUTION_DISABLED,
          decision.reason || "Command execution is disabled for this project"
        );
      }

      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_BLOCKED,
        decision.reason || "Command execution blocked by policy"
      );
    }

    // 4. Resolve working directory
    let workingDir = project.canonicalRoot;
    const specifiedCwd = "cwd" in params ? params.cwd : undefined;
    if (specifiedCwd && specifiedCwd.trim() !== "" && specifiedCwd !== ".") {
      try {
        const resolved = resolveProjectPath(project.canonicalRoot, specifiedCwd, {
          mustExist: true,
          allowSensitive: false,
        });

        const stat = fs.statSync(resolved.canonicalPath);
        if (!stat.isDirectory()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
            `Working directory '${specifiedCwd}' is not a directory`
          );
        }
        workingDir = resolved.canonicalPath;
      } catch (err) {
        if (err instanceof LocalBridgeError) {
          if (err.code === LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY) {
            throw err;
          }
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
            `Invalid working directory '${specifiedCwd}': ${err.message}`
          );
        }
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
          `Failed to inspect working directory '${specifiedCwd}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // 5. Spec-specific validations and command preparation
    let targetExecutableTool: "node" | "npm" | "pnpm" | "python";
    let commandArgs: string[] = [];

    switch (params.kind) {
      case "tool-version": {
        targetExecutableTool = params.tool;
        commandArgs = ["--version"];
        break;
      }

      case "node-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(project.canonicalRoot, params.path, {
            mustExist: true,
            allowSensitive: false,
          });
          scriptCanonicalPath = resolved.canonicalPath;
        } catch (err) {
          if (err instanceof SecurityPathError) {
            if (err.code === LocalBridgeErrorCode.FILE_NOT_FOUND) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
                `Node script '${params.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${params.path}' is located in a protected sensitive location`
              );
            }
          }
          throw err;
        }

        try {
          const stat = fs.statSync(scriptCanonicalPath);
          const lstat = fs.lstatSync(scriptCanonicalPath);
          if (!stat.isFile() || lstat.isSymbolicLink()) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
              `Node script '${params.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect node script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetExecutableTool = "node";
        commandArgs = [scriptCanonicalPath, ...(params.args ?? [])];
        break;
      }

      case "python-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(project.canonicalRoot, params.path, {
            mustExist: true,
            allowSensitive: false,
          });
          scriptCanonicalPath = resolved.canonicalPath;
        } catch (err) {
          if (err instanceof SecurityPathError) {
            if (err.code === LocalBridgeErrorCode.FILE_NOT_FOUND) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
                `Python script '${params.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${params.path}' is located in a protected sensitive location`
              );
            }
          }
          throw err;
        }

        try {
          const stat = fs.statSync(scriptCanonicalPath);
          const lstat = fs.lstatSync(scriptCanonicalPath);
          if (!stat.isFile() || lstat.isSymbolicLink()) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
              `Python script '${params.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect python script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetExecutableTool = "python";
        commandArgs = [scriptCanonicalPath, ...(params.args ?? [])];
        break;
      }

      case "package-script": {
        // Inspect package.json in working directory
        const packageJsonPath = path.join(workingDir, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `package.json not found in working directory '${workingDir}'`
          );
        }

        let packageJsonContent: unknown;
        try {
          packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        } catch {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to parse package.json in '${workingDir}'`
          );
        }

        const scripts = (packageJsonContent as { scripts?: Record<string, unknown> })?.scripts;
        if (!scripts || typeof scripts[params.script] !== "string") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Script '${params.script}' is not defined in package.json scripts`
          );
        }

        targetExecutableTool = params.manager;
        commandArgs = [
          "run",
          params.script,
          ...(params.args && params.args.length > 0 ? ["--", ...params.args] : []),
        ];
        break;
      }

      default: {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_UNSUPPORTED,
          `Unsupported command kind`
        );
      }
    }

    // 6. Resolve trusted host executable
    const resolvedTool = await this.executableRegistry.getExecutable(targetExecutableTool);
    const finalArgs = [...(resolvedTool.prependArgs ?? []), ...commandArgs];

    // 7. Build hardened environment
    const safeEnv = buildSafeProcessEnv(this.runnerStateDir);

    // 8. Execute subprocess with resource bounds and timeout
    const timeoutMs = "timeoutMs" in params ? params.timeoutMs : undefined;
    const execution = await this.processRunner.run({
      executablePath: resolvedTool.executablePath,
      args: finalArgs,
      cwd: workingDir,
      env: safeEnv,
      timeoutMs,
      canonicalProjectRoot: project.canonicalRoot,
      runnerStateDir: this.runnerStateDir,
    });

    return {
      projectId: params.projectId,
      risk: assessment.risk as "SAFE" | "CAUTION",
      exitCode: execution.exitCode,
      signal: null,
      durationMs: execution.durationMs,
      stdout: execution.stdout,
      stderr: execution.stderr,
      timedOut: execution.timedOut,
    };
  }
}

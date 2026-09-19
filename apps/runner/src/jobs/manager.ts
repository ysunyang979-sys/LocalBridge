import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandSpec,
  type JobStartParams,
  type JobStartResult,
  type JobStatusResult,
  type JobLogsParams,
  type JobLogsResult,
  type JobCancelResult,
  type JobListParams,
  type JobListResult,
  type BuildStartParams,
  type BuildStartResult,
  type TestStartParams,
  type TestStartResult,
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
import type { ExecutableRegistry } from "../process/executable-registry.js";
import { buildSafeProcessEnv } from "../process/environment.js";
import { killProcessTree } from "../process/kill-tree.js";
import { JobLogBuffer } from "./log-buffer.js";
import {
  type JobRecord,
  MAX_RUNNING_JOBS_PER_RUNNER,
  MAX_RUNNING_JOBS_PER_PROJECT,
  MAX_JOB_STARTS_PER_MINUTE,
  DEFAULT_JOB_TIMEOUT_MS,
  MIN_JOB_TIMEOUT_MS,
  MAX_JOB_TIMEOUT_MS,
  MAX_JOB_LOG_BYTES,
  MAX_JOB_HISTORY,
  JOB_HISTORY_MAX_AGE_MS,
} from "./types.js";

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly startTimestamps: number[] = [];

  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly executableRegistry: ExecutableRegistry,
    private readonly runnerStateDir: string,
    private readonly logger?: Logger
  ) {
    this.wireProjectRegistryEvents();
  }

  /**
   * Listen to ProjectRegistry mutations and automatically cancel active jobs
   * when project permissions are removed, disabled, or downgraded.
   */
  private wireProjectRegistryEvents(): void {
    this.projectRegistry.on("project:removed", (projectId: string) => {
      this.logger?.info({ event: "project_removed_cancelling_jobs", projectId }, "Project removed; cancelling running jobs");
      this.cancelProjectJobs(projectId, "Project was removed from local registry");
    });

    this.projectRegistry.on("project:disabled", (projectId: string) => {
      this.logger?.info({ event: "project_disabled_cancelling_jobs", projectId }, "Project disabled; cancelling running jobs");
      this.cancelProjectJobs(projectId, "Project authorization was disabled");
    });

    this.projectRegistry.on("project:execution_mode_changed", (projectId: string, mode: string) => {
      if (mode === "disabled" || mode === "safe-only") {
        this.logger?.info({ event: "project_execution_mode_changed_cancelling_jobs", projectId, mode }, "Project executionMode downgraded; cancelling active script jobs");
        this.cancelProjectJobs(projectId, `Project executionMode changed to "${mode}"`);
      }
    });
  }

  /**
   * Cancel all running jobs for a given project.
   */
  cancelProjectJobs(projectId: string, reason?: string): void {
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId && job.state === "running") {
        this.logger?.warn({ jobId: job.id, projectId, reason }, "Aborting active project job");
        this.cancelJob(job.id).catch(() => {});
      }
    }
  }

  /**
   * Cancel all currently running jobs across all projects (e.g. for Emergency Stop).
   */
  async cancelAllJobs(reason?: string): Promise<{ cancelledCount: number; jobIds: string[] }> {
    const jobIds: string[] = [];
    for (const job of this.jobs.values()) {
      if (job.state === "running" || job.state === "queued") {
        this.logger?.warn({ jobId: job.id, reason }, "Emergency stop: aborting active job");
        await this.cancelJob(job.id).catch(() => {});
        jobIds.push(job.id);
      }
    }
    return {
      cancelledCount: jobIds.length,
      jobIds,
    };
  }

  /**
   * Check runner and project concurrency bounds.
   */
  private checkCapacity(projectId: string): void {
    const runningJobs = Array.from(this.jobs.values()).filter((j) => j.state === "running");
    if (runningJobs.length >= MAX_RUNNING_JOBS_PER_RUNNER) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_CAPACITY_EXCEEDED,
        `Runner running job limit of ${MAX_RUNNING_JOBS_PER_RUNNER} has been reached`
      );
    }

    const projectRunningJobs = runningJobs.filter((j) => j.projectId === projectId);
    if (projectRunningJobs.length >= MAX_RUNNING_JOBS_PER_PROJECT) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_CAPACITY_EXCEEDED,
        `Project running job limit of ${MAX_RUNNING_JOBS_PER_PROJECT} has been reached for project '${projectId}'`
      );
    }
  }

  /**
   * Check rate limit: max 20 starts per minute per runner.
   */
  private checkRateLimit(): void {
    const now = Date.now();
    const cutoff = now - 60000;

    // Remove timestamps older than 1 minute
    while (this.startTimestamps.length > 0 && this.startTimestamps[0]! <= cutoff) {
      this.startTimestamps.shift();
    }

    if (this.startTimestamps.length >= MAX_JOB_STARTS_PER_MINUTE) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_RATE_LIMITED,
        `Job start rate limit (${MAX_JOB_STARTS_PER_MINUTE} starts per minute) exceeded`
      );
    }

    this.startTimestamps.push(now);
  }

  /**
   * Prune oldest completed jobs when history limit is exceeded or completed jobs are older than 24h.
   */
  private pruneOldJobs(): void {
    const now = Date.now();

    // 1. Evict completed jobs older than 24 hours
    for (const [id, job] of this.jobs.entries()) {
      if (job.state !== "running" && job.finishedAt && now - job.finishedAt > JOB_HISTORY_MAX_AGE_MS) {
        this.jobs.delete(id);
      }
    }

    // 2. If history still exceeds MAX_JOB_HISTORY, evict oldest finished jobs
    if (this.jobs.size > MAX_JOB_HISTORY) {
      const finishedJobs = Array.from(this.jobs.values())
        .filter((j) => j.state !== "running")
        .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));

      while (this.jobs.size > MAX_JOB_HISTORY && finishedJobs.length > 0) {
        const oldest = finishedJobs.shift()!;
        this.jobs.delete(oldest.id);
      }
    }
  }

  /**
   * Start a background job executing a validated CommandSpec.
   * Returns immediately with the assigned jobId.
   */
  async startJob(params: JobStartParams): Promise<JobStartResult> {
    const command = params.command;

    // 1. Verify project exists
    const project = this.projectRegistry.get(command.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${command.projectId}' not found in Runner project registry`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project '${project.name}' (${project.id}) is disabled`
      );
    }

    // 2. Concurrency and rate limit checks
    this.checkCapacity(project.id);
    this.checkRateLimit();

    // 3. Validate arguments if present
    if ("args" in command && Array.isArray(command.args)) {
      const validation = validateCommandArguments(command.args);
      if (!validation.valid) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_ARGUMENTS_TOO_LARGE,
          validation.reason || "Command arguments exceed allowed limits"
        );
      }
    }

    // 4. Classify risk and evaluate execution policy
    const assessment = CommandClassifier.classify(command);
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

    // 5. Resolve working directory
    let workingDir = project.canonicalRoot;
    const specifiedCwd = "cwd" in command ? command.cwd : undefined;
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

    // 6. Command spec preparation
    let targetTool: "node" | "npm" | "pnpm" | "python" = "node";
    let commandArgs: string[] = [];

    switch (command.kind) {
      case "tool-version": {
        targetTool = command.tool;
        commandArgs = ["--version"];
        break;
      }

      case "node-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(project.canonicalRoot, command.path, {
            mustExist: true,
            allowSensitive: false,
          });
          scriptCanonicalPath = resolved.canonicalPath;
        } catch (err) {
          if (err instanceof SecurityPathError) {
            if (err.code === LocalBridgeErrorCode.FILE_NOT_FOUND) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
                `Node script '${command.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${command.path}' is located in a protected sensitive location`
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
              `Node script '${command.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect node script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetTool = "node";
        commandArgs = [scriptCanonicalPath, ...(command.args ?? [])];
        break;
      }

      case "python-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(project.canonicalRoot, command.path, {
            mustExist: true,
            allowSensitive: false,
          });
          scriptCanonicalPath = resolved.canonicalPath;
        } catch (err) {
          if (err instanceof SecurityPathError) {
            if (err.code === LocalBridgeErrorCode.FILE_NOT_FOUND) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
                `Python script '${command.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${command.path}' is located in a protected sensitive location`
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
              `Python script '${command.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect python script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetTool = "python";
        commandArgs = [scriptCanonicalPath, ...(command.args ?? [])];
        break;
      }

      case "package-script": {
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
        if (!scripts || typeof scripts[command.script] !== "string") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Script '${command.script}' is not defined in package.json scripts`
          );
        }

        const scriptValue = typeof scripts[command.script] === "string" ? (scripts[command.script] as string).trim() : "";
        let useDirectNode = false;

        const managerAvailable = await this.executableRegistry.hasExecutable(command.manager);
        if (!managerAvailable && scriptValue.startsWith("node ")) {
          const parts = scriptValue.slice(5).trim().split(/\s+/);
          const entryFile = parts[0];
          if (entryFile) {
            const resolvedPath = resolveProjectPath(project.canonicalRoot, entryFile, {
              mustExist: true,
              allowSensitive: false,
            });
            targetTool = "node";
            commandArgs = [resolvedPath.canonicalPath, ...parts.slice(1), ...(command.args ?? [])];
            useDirectNode = true;
          }
        }

        if (!useDirectNode) {
          targetTool = command.manager;
          commandArgs = [
            "run",
            command.script,
            ...(command.args && command.args.length > 0 ? ["--", ...command.args] : []),
          ];
        }
        break;
      }

      default: {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_UNSUPPORTED,
          `Unsupported command kind`
        );
      }
    }

    // 7. Resolve executable and environment
    const resolvedTool = await this.executableRegistry.getExecutable(targetTool);
    const finalArgs = [...(resolvedTool.prependArgs ?? []), ...commandArgs];
    const safeEnv = buildSafeProcessEnv(this.runnerStateDir);

    // 8. Timeout bound (Job-level timeout takes precedence over command-level timeout)
    const timeoutMs = Math.min(
      Math.max(params.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS, MIN_JOB_TIMEOUT_MS),
      MAX_JOB_TIMEOUT_MS
    );

    // 9. Create Job Record
    const jobId = `job_${crypto.randomUUID()}`;
    const logs = new JobLogBuffer(MAX_JOB_LOG_BYTES);
    const createdAt = Date.now();

    const jobRecord: JobRecord = {
      id: jobId,
      projectId: project.id,
      commandKind: command.kind,
      risk: assessment.risk,
      state: "running",
      createdAt,
      startedAt: createdAt,
      finishedAt: null,
      exitCode: null,
      signal: null,
      logs,
      canonicalProjectRoot: project.canonicalRoot,
    };

    // 10. Spawn Subprocess directly with shell: false
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(resolvedTool.executablePath, finalArgs, {
        cwd: workingDir,
        env: safeEnv,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
      jobRecord.process = child;
    } catch (err) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_EXECUTION_FAILED,
        `Failed to spawn job process: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 11. Wire Subprocess event handlers
    child.stdout?.on("data", (chunk: Buffer) => {
      jobRecord.logs.append("stdout", chunk, project.canonicalRoot, this.runnerStateDir);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      jobRecord.logs.append("stderr", chunk, project.canonicalRoot, this.runnerStateDir);
    });

    jobRecord.timeoutTimer = setTimeout(async () => {
      await this.handleTimeout(jobId);
    }, timeoutMs);

    child.on("close", (code, signal) => {
      this.finalizeJob(jobId, { exitCode: code, signal });
    });

    child.on("error", (err) => {
      this.logger?.error({ jobId, err }, "Job child process emitted error");
      this.finalizeJob(jobId, { exitCode: 1, signal: null });
    });

    this.jobs.set(jobId, jobRecord);
    this.logger?.info(
      { jobId, projectId: project.id, commandKind: command.kind, timeoutMs },
      "Started background job"
    );

    return {
      jobId,
      state: "running",
      createdAt,
    };
  }

  /**
   * Handle job execution timeout.
   */
  private async handleTimeout(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== "running") return;

    this.logger?.warn({ jobId }, "Job execution timed out; terminating process tree");
    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = undefined;
    }

    if (job.process?.pid) {
      try {
        await killProcessTree(job.process.pid);
      } catch {
        // ignore kill error
      }
    }

    job.logs.append("stderr", "\n[LocalBridge] Job execution timed out; terminated process tree.\n");
    job.state = "timed-out";
    job.finishedAt = Date.now();
    job.process = undefined;
    this.pruneOldJobs();
  }

  /**
   * Finalize job execution idempotently upon process close or error.
   */
  private finalizeJob(
    jobId: string,
    result: { exitCode: number | null; signal: string | null }
  ): void {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== "running") return;

    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = undefined;
    }

    job.finishedAt = Date.now();
    job.exitCode = result.exitCode;
    job.signal = result.signal;
    job.state = result.exitCode === 0 ? "succeeded" : "failed";
    job.process = undefined;

    this.logger?.info(
      {
        jobId,
        state: job.state,
        exitCode: job.exitCode,
        durationMs: (job.finishedAt - (job.startedAt ?? job.createdAt)),
      },
      "Background job completed"
    );

    this.pruneOldJobs();
  }

  /**
   * Cancel a running job by terminating its entire process tree.
   * Returns alreadyTerminal: true if the job is already finished.
   */
  async cancelJob(jobId: string): Promise<JobCancelResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_NOT_FOUND,
        `Job with ID '${jobId}' not found`
      );
    }

    if (job.state !== "running") {
      return {
        jobId: job.id,
        state: job.state,
        alreadyTerminal: true,
      };
    }

    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = undefined;
    }

    const pid = job.process?.pid;
    job.state = "cancelled";
    job.finishedAt = Date.now();
    job.process = undefined;

    if (pid) {
      try {
        await killProcessTree(pid);
      } catch {
        // ignore
      }
    }

    this.logger?.info({ jobId }, "Cancelled background job and terminated process tree");
    this.pruneOldJobs();

    return {
      jobId: job.id,
      state: "cancelled",
      alreadyTerminal: false,
    };
  }

  /**
   * Query status of a job.
   */
  getJobStatus(jobId: string): JobStatusResult {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_NOT_FOUND,
        `Job with ID '${jobId}' not found`
      );
    }

    const durationMs =
      (job.finishedAt ?? Date.now()) - (job.startedAt ?? job.createdAt);

    return {
      jobId: job.id,
      projectId: job.projectId,
      state: job.state,
      risk: job.risk,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      signal: job.signal,
      durationMs: Math.max(durationMs, 0),
    };
  }

  /**
   * Query paginated sanitized logs of a job.
   */
  getJobLogs(params: JobLogsParams): JobLogsResult {
    const job = this.jobs.get(params.jobId);
    if (!job) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_NOT_FOUND,
        `Job with ID '${params.jobId}' not found`
      );
    }

    const logData = job.logs.getLogs({
      cursor: params.cursor,
      limit: params.limit,
    });

    return {
      jobId: job.id,
      chunks: logData.chunks,
      nextCursor: logData.nextCursor,
      truncated: logData.truncated,
      droppedBytes: logData.droppedBytes,
    };
  }

  /**
   * List jobs currently stored in Runner memory.
   */
  listJobs(params?: JobListParams): JobListResult {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    let matched = Array.from(this.jobs.values());

    if (params?.projectId) {
      matched = matched.filter((j) => j.projectId === params.projectId);
    }
    if (params?.state) {
      matched = matched.filter((j) => j.state === params.state);
    }

    // Sort by createdAt descending
    matched.sort((a, b) => b.createdAt - a.createdAt);

    const summaries = matched.slice(0, limit).map((j) => ({
      jobId: j.id,
      projectId: j.projectId,
      state: j.state,
      commandKind: j.commandKind,
      risk: j.risk,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      exitCode: j.exitCode,
    }));

    return { jobs: summaries };
  }

  /**
   * High-level wrapper for package build script.
   */
  async startBuild(params: BuildStartParams): Promise<BuildStartResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${params.projectId}' not found in Runner project registry`
      );
    }

    const scriptName = params.script || "build";
    const workingDir = params.cwd && params.cwd !== "."
      ? resolveProjectPath(project.canonicalRoot, params.cwd, { mustExist: true, allowSensitive: false }).canonicalPath
      : project.canonicalRoot;

    const pkgJsonPath = path.join(workingDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND,
        `package.json not found in working directory '${workingDir}'`
      );
    }

    let parsed: { scripts?: Record<string, unknown> };
    try {
      parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND,
        `Failed to parse package.json in '${workingDir}'`
      );
    }

    if (!parsed.scripts || typeof parsed.scripts[scriptName] !== "string") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND,
        `Build script '${scriptName}' not defined in package.json scripts`
      );
    }

    const command: CommandSpec = {
      kind: "package-script",
      projectId: params.projectId,
      manager: params.manager || "pnpm",
      script: scriptName,
      args: params.args ?? [],
      cwd: params.cwd ?? ".",
      timeoutMs: params.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    };

    const startResult = await this.startJob({
      command,
      timeoutMs: params.timeoutMs,
    });

    return {
      jobId: startResult.jobId,
      state: startResult.state,
      createdAt: startResult.createdAt,
    };
  }

  /**
   * High-level wrapper for package test script.
   */
  async startTest(params: TestStartParams): Promise<TestStartResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${params.projectId}' not found in Runner project registry`
      );
    }

    const scriptName = params.script || "test";
    const workingDir = params.cwd && params.cwd !== "."
      ? resolveProjectPath(project.canonicalRoot, params.cwd, { mustExist: true, allowSensitive: false }).canonicalPath
      : project.canonicalRoot;

    const pkgJsonPath = path.join(workingDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND,
        `package.json not found in working directory '${workingDir}'`
      );
    }

    let parsed: { scripts?: Record<string, unknown> };
    try {
      parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND,
        `Failed to parse package.json in '${workingDir}'`
      );
    }

    if (!parsed.scripts || typeof parsed.scripts[scriptName] !== "string") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND,
        `Test script '${scriptName}' not defined in package.json scripts`
      );
    }

    const command: CommandSpec = {
      kind: "package-script",
      projectId: params.projectId,
      manager: params.manager || "pnpm",
      script: scriptName,
      args: params.args ?? [],
      cwd: params.cwd ?? ".",
      timeoutMs: params.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    };

    const startResult = await this.startJob({
      command,
      timeoutMs: params.timeoutMs,
    });

    return {
      jobId: startResult.jobId,
      state: startResult.state,
      createdAt: startResult.createdAt,
    };
  }

  /**
   * Stop manager and cancel all active jobs (used during Runner shutdown).
   */
  async stop(): Promise<void> {
    this.logger?.info("Stopping JobManager; cancelling all active jobs");
    const activeJobs = Array.from(this.jobs.values()).filter((j) => j.state === "running");
    for (const job of activeJobs) {
      try {
        await this.cancelJob(job.id);
      } catch {
        // ignore
      }
    }
  }
}

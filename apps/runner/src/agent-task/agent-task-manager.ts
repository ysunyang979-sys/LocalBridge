import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  computeFailureFingerprint,
} from "@localbridge/security";
import type {
  AgentTaskCreateParams,
  AgentTaskCreateResult,
  AgentTaskStatusParams,
  AgentTaskStatusResult,
  AgentTaskLogsParams,
  AgentTaskLogsResult,
  AgentTaskCancelParams,
  AgentTaskCancelResult,
  AgentTaskPauseParams,
  AgentTaskPauseResult,
  AgentTaskResumeParams,
  AgentTaskResumeResult,
  AgentTaskListParams,
  AgentTaskListResult,
  AgentTaskApproveParams,
  AgentTaskApproveResult,
  AgentTaskSummary,
  AgentTaskState,
  AgentResourcePolicy,
  AgentResourceUsage,
  AgentCheckpoint,
  AgentTaskLogEntry,
  AgentTaskLogType,
} from "@localbridge/protocol";
import { type Logger } from "@localbridge/shared";
import type { ProcessOwnershipTracker } from "../process/ownership-tracker.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import type { PersistentRuntimeManager } from "../runtime/manager.js";

interface InternalAgentTaskRecord {
  id: string;
  projectId: string;
  sessionId?: string;
  title: string;
  goal: string;
  state: AgentTaskState;
  resourcePolicy: AgentResourcePolicy;
  resourceUsage: AgentResourceUsage;
  iteration: number;
  actionCount: number;
  failureCount: number;
  sameActionRepeats: number;
  lastFailureFingerprint?: string | null;
  waitingForApproval: boolean;
  pendingApprovalId?: string | null;
  createdAt: number;
  startedAt?: number | null;
  deadlineAt: number;
  finishedAt?: number | null;
  latestCheckpoint?: AgentCheckpoint | null;
  logs: AgentTaskLogEntry[];
  nextLogSequence: number;
  wallTimer?: NodeJS.Timeout;
}

export class AgentTaskManager {
  private readonly tasks = new Map<string, InternalAgentTaskRecord>();
  private readonly tasksDir?: string;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly ownershipTracker?: ProcessOwnershipTracker,
    private readonly terminalManager?: TerminalManager,
    public readonly runtimeManager?: PersistentRuntimeManager,
    private readonly logger?: Logger
  ) {
    if (this.runnerStateDir) {
      this.tasksDir = path.join(this.runnerStateDir, "agent-tasks");
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true });
      }
      this.reconcileAndRecover();
    }
  }

  /**
   * Recover persisted agent tasks on startup and reconcile with live actual state.
   */
  private reconcileAndRecover(): void {
    if (!this.tasksDir || !fs.existsSync(this.tasksDir)) return;
    try {
      const files = fs.readdirSync(this.tasksDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const fullPath = path.join(this.tasksDir, file);
        const data = fs.readFileSync(fullPath, "utf-8");
        const task = JSON.parse(data) as InternalAgentTaskRecord;

        // Verify checkpoint versioning and migration
        if (task.latestCheckpoint && task.latestCheckpoint.schemaVersion !== 1) {
          this.logger?.warn({ taskId: task.id }, "Migrating checkpoint schema to version 1");
          task.latestCheckpoint = this.migrateCheckpoint(task.latestCheckpoint, 1);
        }

        // State reconciliation: If task was running or planning, reconcile against actual processes
        if (task.state === "running" || task.state === "planning") {
          if (Date.now() > task.deadlineAt) {
            task.state = "timed_out";
            task.finishedAt = Date.now();
          } else {
            // Keep task paused upon runner restart until explicit resume/reconciliation
            task.state = "paused";
          }
        }

        this.tasks.set(task.id, task);
      }
      this.logger?.info({ count: this.tasks.size }, "Recovered and reconciled Agent tasks");
    } catch (err) {
      this.logger?.warn({ err }, "Error recovering agent tasks from disk");
    }
  }

  /**
   * Schema migration hook for checkpoints.
   */
  private migrateCheckpoint(checkpoint: any, targetVersion: number): AgentCheckpoint {
    if (targetVersion === 1) {
      return {
        schemaVersion: 1,
        checkpointId: checkpoint.checkpointId || `cp_${crypto.randomUUID()}`,
        agentTaskId: checkpoint.agentTaskId,
        iteration: checkpoint.iteration || 0,
        phase: checkpoint.phase || "observe",
        goal: checkpoint.goal || "",
        observations: checkpoint.observations || [],
        actions: checkpoint.actions || [],
        activeRuntimeIds: checkpoint.activeRuntimeIds || [],
        activeTerminalSessionIds: checkpoint.activeTerminalSessionIds || [],
        activeProcessIds: checkpoint.activeProcessIds || [],
        modifiedFiles: checkpoint.modifiedFiles || [],
        lastCommand: checkpoint.lastCommand,
        lastOutputSequence: checkpoint.lastOutputSequence,
        nextAction: checkpoint.nextAction,
        timestamp: checkpoint.timestamp || new Date().toISOString(),
      };
    }
    throw new Error(`Unsupported checkpoint target schema version: ${targetVersion}`);
  }

  /**
   * Atomically save task record and checkpoints to disk.
   */
  private saveTask(task: InternalAgentTaskRecord): void {
    if (!this.tasksDir) return;
    try {
      const filePath = path.join(this.tasksDir, `${task.id}.json`);
      const tmpPath = path.join(this.tasksDir, `${task.id}.tmp.${Date.now()}`);

      const exportable = { ...task };
      delete exportable.wallTimer;

      fs.writeFileSync(tmpPath, JSON.stringify(exportable, null, 2), "utf-8");
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      this.logger?.warn({ err, taskId: task.id }, "Failed to persist agent task atomically");
    }
  }

  /**
   * Create a new Long-term Agent Task.
   */
  async create(params: AgentTaskCreateParams): Promise<AgentTaskCreateResult> {
    const taskId = `task_${crypto.randomUUID()}`;
    const now = Date.now();

    const policy: AgentResourcePolicy = {
      maxWallTimeMs: params.resourcePolicy?.maxWallTimeMs || 7200000, // 2 hours
      maxIterations: params.resourcePolicy?.maxIterations || 100,
      maxCpuTimeMs: params.resourcePolicy?.maxCpuTimeMs,
      maxMemoryBytes: params.resourcePolicy?.maxMemoryBytes || 4294967296, // 4 GB
      maxDiskWriteBytes: params.resourcePolicy?.maxDiskWriteBytes || 5368709120, // 5 GB
      maxOutputBytes: params.resourcePolicy?.maxOutputBytes || 104857600, // 100 MB
      maxTerminalSessions: params.resourcePolicy?.maxTerminalSessions || 4,
      maxRuntimes: params.resourcePolicy?.maxRuntimes || 8,
      maxProcesses: params.resourcePolicy?.maxProcesses || 64,
      maxConcurrentActions: params.resourcePolicy?.maxConcurrentActions || 5,
      maxSameActionRepeats: params.resourcePolicy?.maxSameActionRepeats || 3,
      maxFailures: params.resourcePolicy?.maxFailures || 10,
      maxActions: params.resourcePolicy?.maxActions || 500,
    };

    const deadlineAt = now + policy.maxWallTimeMs;

    const record: InternalAgentTaskRecord = {
      id: taskId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      title: params.title,
      goal: params.goal,
      state: "queued",
      resourcePolicy: policy,
      resourceUsage: {
        wallTimeMs: 0,
        cpuTimeMs: 0,
        memoryBytes: 0,
        diskWriteBytes: 0,
        outputBytes: 0,
        activeTerminalSessions: 0,
        activeRuntimes: 0,
        activeProcesses: 0,
        actionsExecuted: 0,
        iterations: 0,
        failures: 0,
      },
      iteration: 0,
      actionCount: 0,
      failureCount: 0,
      sameActionRepeats: 0,
      waitingForApproval: false,
      createdAt: now,
      startedAt: null,
      deadlineAt,
      finishedAt: null,
      logs: [],
      nextLogSequence: 1,
    };

    // Setup wall-clock timer
    record.wallTimer = setTimeout(() => {
      this.handleWallClockTimeout(record.id);
    }, policy.maxWallTimeMs);

    this.addLog(record, "system", "info", `Agent Task '${record.title}' created`, {
      goal: record.goal,
      deadlineAt,
    });

    this.tasks.set(taskId, record);
    this.saveTask(record);

    return {
      agentTaskId: taskId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      title: record.title,
      goal: record.goal,
      state: "queued",
      deadlineAt,
      resourcePolicy: policy,
      createdAt: now,
    };
  }

  /**
   * Get Agent Task status and governance counters.
   */
  async status(params: AgentTaskStatusParams): Promise<AgentTaskStatusResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (record.state === "running" && Date.now() > record.deadlineAt) {
      this.handleWallClockTimeout(record.id);
    }

    return {
      agentTaskId: record.id,
      projectId: record.projectId,
      sessionId: record.sessionId,
      title: record.title,
      goal: record.goal,
      state: record.state,
      iteration: record.iteration,
      actionCount: record.actionCount,
      failureCount: record.failureCount,
      waitingForApproval: record.waitingForApproval,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      deadlineAt: record.deadlineAt,
      finishedAt: record.finishedAt,
      resourcePolicy: record.resourcePolicy,
      resourceUsage: record.resourceUsage,
      pendingApprovalId: record.pendingApprovalId,
      lastFailureFingerprint: record.lastFailureFingerprint,
      sameActionRepeats: record.sameActionRepeats,
      latestCheckpoint: record.latestCheckpoint,
    };
  }

  /**
   * Query incremental logs.
   */
  async logs(params: AgentTaskLogsParams): Promise<AgentTaskLogsResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    const fromSeq = params.fromSequence || 0;
    const limit = params.limit || 100;

    let filtered = record.logs.filter((l) => l.sequence >= fromSeq);
    if (params.logType) {
      filtered = filtered.filter((l) => l.logType === params.logType);
    }

    const slice = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const latestSeq = record.logs.length > 0 ? (record.logs[record.logs.length - 1]?.sequence ?? 0) : 0;

    return {
      agentTaskId: record.id,
      logs: slice,
      latestSequence: latestSeq,
      hasMore,
    };
  }

  /**
   * Cancel an Agent Task and terminate all owned resources.
   */
  async cancel(params: AgentTaskCancelParams): Promise<AgentTaskCancelResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (record.wallTimer) {
      clearTimeout(record.wallTimer);
      record.wallTimer = undefined;
    }

    record.state = "cancelled";
    record.finishedAt = Date.now();

    this.addLog(record, "system", "warn", `Agent Task cancelled: ${params.reason || "Manual cancellation"}`);
    this.cleanupAgentResources(record.id);
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      state: "cancelled",
      cancelledAt: record.finishedAt,
      reason: params.reason,
    };
  }

  /**
   * Pause Agent Task decision loop (keeps resources alive).
   */
  async pause(params: AgentTaskPauseParams): Promise<AgentTaskPauseResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    record.state = "paused";
    this.addLog(record, "system", "info", `Agent Task paused: ${params.reason || "Manual pause"}`);
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      state: "paused",
      pausedAt: Date.now(),
      reason: params.reason,
    };
  }

  /**
   * Resume Agent Task with fresh observation and state reconciliation.
   */
  async resume(params: AgentTaskResumeParams): Promise<AgentTaskResumeResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (record.state === "completed" || record.state === "failed" || record.state === "timed_out") {
      throw new Error(`Cannot resume Agent task in terminal state '${record.state}'`);
    }

    // Check deadline
    if (Date.now() > record.deadlineAt) {
      this.handleWallClockTimeout(record.id);
      throw new Error("Cannot resume: Agent task wall-clock deadline has expired");
    }

    record.state = "running";
    if (!record.startedAt) {
      record.startedAt = Date.now();
    }

    // Reconcile actual resources
    let liveProcsCount = 0;
    if (this.ownershipTracker) {
      const procs = await this.ownershipTracker.listProcesses(record.projectId, "ALL");
      liveProcsCount = procs.filter((p) => p.agentTaskId === record.id).length;
    }

    record.resourceUsage.activeProcesses = liveProcsCount;
    this.addLog(record, "system", "info", "Agent Task resumed with fresh state reconciliation", {
      liveProcesses: liveProcsCount,
    });

    this.saveTask(record);

    return {
      agentTaskId: record.id,
      state: "running",
      resumedAt: Date.now(),
      reconciledActualState: {
        activeProcesses: liveProcsCount,
      },
    };
  }

  /**
   * List Agent Tasks.
   */
  async list(params: AgentTaskListParams): Promise<AgentTaskListResult> {
    const list: AgentTaskSummary[] = [];

    for (const record of this.tasks.values()) {
      if (params.projectId && record.projectId !== params.projectId) continue;
      if (params.state && record.state !== params.state) continue;

      list.push({
        agentTaskId: record.id,
        projectId: record.projectId,
        sessionId: record.sessionId,
        title: record.title,
        goal: record.goal,
        state: record.state,
        iteration: record.iteration,
        actionCount: record.actionCount,
        failureCount: record.failureCount,
        waitingForApproval: record.waitingForApproval,
        createdAt: record.createdAt,
        startedAt: record.startedAt,
        deadlineAt: record.deadlineAt,
        finishedAt: record.finishedAt,
      });
    }

    return {
      tasks: list,
      total: list.length,
    };
  }

  /**
   * Handle user approval or rejection for an Agent Task action.
   */
  async approve(params: AgentTaskApproveParams): Promise<AgentTaskApproveResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (params.action === "approve") {
      record.waitingForApproval = false;
      record.pendingApprovalId = null;
      record.state = "running";
      this.addLog(record, "approval", "info", `Approval '${params.approvalId}' granted by user`);
    } else {
      record.waitingForApproval = false;
      record.pendingApprovalId = null;
      this.addLog(record, "approval", "warn", `Approval '${params.approvalId}' rejected by user: ${params.reason || "No reason given"}`);
    }

    this.saveTask(record);

    return {
      agentTaskId: record.id,
      approvalId: params.approvalId,
      action: params.action,
      state: record.state,
      message: params.action === "approve" ? "Action approved, agent running" : "Action rejected",
    };
  }

  /**
   * Record action execution, enforce action budget, and detect failure loops.
   */
  recordAction(
    taskId: string,
    actionName: string,
    command?: string,
    exitCode = 0,
    errorText?: string
  ): void {
    const record = this.tasks.get(taskId);
    if (!record) return;

    record.actionCount++;
    record.resourceUsage.actionsExecuted++;

    // 1. Budget check
    if (record.actionCount > record.resourcePolicy.maxActions) {
      record.state = "resource_limited";
      this.addLog(record, "resource", "error", `AGENT_ACTION_LIMIT: Exceeded max action budget of ${record.resourcePolicy.maxActions}`);
      this.cleanupAgentResources(record.id);
      this.saveTask(record);
      return;
    }

    // 2. Failure and loop detection
    if (exitCode !== 0) {
      record.failureCount++;
      record.resourceUsage.failures++;

      const fingerprint = computeFailureFingerprint(command || actionName, exitCode, errorText);
      if (record.lastFailureFingerprint === fingerprint) {
        record.sameActionRepeats++;
        if (record.sameActionRepeats >= record.resourcePolicy.maxSameActionRepeats) {
          record.state = "waiting";
          this.addLog(
            record,
            "error",
            "error",
            `FAILURE_LOOP_DETECTED: Action '${actionName}' failed ${record.sameActionRepeats} times consecutively with fingerprint ${fingerprint}. Pausing loop.`
          );
          this.saveTask(record);
          return;
        }
      } else {
        record.lastFailureFingerprint = fingerprint;
        record.sameActionRepeats = 1;
      }
    } else {
      // Successful action resets consecutive failure repeats
      record.sameActionRepeats = 0;
      record.lastFailureFingerprint = null;
    }

    this.addLog(record, "action", exitCode === 0 ? "info" : "warn", `Executed action '${actionName}'`, {
      command,
      exitCode,
      errorText,
    });
    this.saveTask(record);
  }

  /**
   * Save a versioned checkpoint atomically.
   */
  saveCheckpoint(taskId: string, checkpointData: Partial<AgentCheckpoint>): AgentCheckpoint {
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    const checkpoint: AgentCheckpoint = {
      schemaVersion: 1,
      checkpointId: `cp_${crypto.randomUUID()}`,
      agentTaskId: taskId,
      iteration: record.iteration,
      phase: checkpointData.phase || "observe",
      goal: record.goal,
      observations: checkpointData.observations || [],
      actions: checkpointData.actions || [],
      activeRuntimeIds: checkpointData.activeRuntimeIds || [],
      activeTerminalSessionIds: checkpointData.activeTerminalSessionIds || [],
      activeProcessIds: checkpointData.activeProcessIds || [],
      modifiedFiles: checkpointData.modifiedFiles || [],
      lastCommand: checkpointData.lastCommand,
      lastOutputSequence: record.logs.length,
      nextAction: checkpointData.nextAction,
      timestamp: new Date().toISOString(),
    };

    record.latestCheckpoint = checkpoint;
    this.addLog(record, "checkpoint", "info", `Checkpoint saved at iteration ${record.iteration}`, {
      phase: checkpoint.phase,
    });
    this.saveTask(record);

    return checkpoint;
  }

  private handleWallClockTimeout(taskId: string): void {
    const record = this.tasks.get(taskId);
    if (!record || record.state === "completed" || record.state === "cancelled") return;

    record.state = "timed_out";
    record.finishedAt = Date.now();
    this.addLog(record, "system", "error", `WALL_CLOCK_TIMEOUT: Task reached deadline of ${record.resourcePolicy.maxWallTimeMs}ms`);
    this.cleanupAgentResources(taskId);
    this.saveTask(record);
  }

  private cleanupAgentResources(taskId: string): void {
    // 1. Terminate all agent-owned processes
    if (this.ownershipTracker) {
      this.ownershipTracker.listProcesses(undefined, "ALL").then((procs) => {
        for (const p of procs) {
          if (p.agentTaskId === taskId) {
            this.ownershipTracker?.killProcess(p.pid, { force: true, hasApproval: true }).catch(() => {});
          }
        }
      });
    }

    // 2. Stop agent-owned terminals
    if (this.terminalManager) {
      this.terminalManager.list({}).then((res) => {
        for (const t of res.terminals) {
          if (t.agentTaskId === taskId) {
            this.terminalManager?.stop({ terminalSessionId: t.terminalSessionId, force: true }).catch(() => {});
          }
        }
      });
    }
  }

  private addLog(
    record: InternalAgentTaskRecord,
    logType: AgentTaskLogType,
    level: "info" | "warn" | "error" | "debug",
    message: string,
    data?: Record<string, any>
  ): void {
    const entry: AgentTaskLogEntry = {
      id: `log_${crypto.randomUUID()}`,
      agentTaskId: record.id,
      sequence: record.nextLogSequence++,
      logType,
      level,
      message,
      data,
      timestamp: Date.now(),
    };
    record.logs.push(entry);
    if (record.logs.length > 5000) {
      record.logs.splice(0, record.logs.length - 5000);
    }
  }
}

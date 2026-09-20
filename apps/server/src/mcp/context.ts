import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type RunnerRpcMap,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type Database from "better-sqlite3";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { McpPrincipal } from "./types.js";

export interface McpContextDeps {
  projectService: ServerProjectService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  db?: Database.Database;
  logger?: Logger;
}

export interface SafeAuditMetadata {
  id: string;
  timestamp: string;
  event: string;
  principalId?: string;
  authType?: string;
  toolName: string;
  projectId?: string;
  runnerId?: string;
  relativePath?: string;
  durationMs?: number;
  resultStatus?: "success" | "error";
  errorCode?: string;
  decisionSource?: string;
  policyLevel?: string;
  actorDisplayName?: string;
}

export type AuditRecord = SafeAuditMetadata;

export class McpContext {
  public readonly projectService: ServerProjectService;
  public readonly runnerRegistry: RunnerRegistry;
  public readonly rpcService: RunnerRpcService;
  public readonly db?: Database.Database;
  public readonly logger?: Logger;

  // In-memory mapping from jobId to runnerId for background jobs
  private readonly jobToRunnerMap = new Map<string, string>();

  // Global pause state for AI access
  private isPausedState = false;

  // In-memory sanitized audit log ring buffer (up to 500 events)
  private readonly auditLogBuffer: AuditRecord[] = [];
  private readonly maxAuditLogSize = 500;

  constructor(deps: McpContextDeps) {
    this.projectService = deps.projectService;
    this.runnerRegistry = deps.runnerRegistry;
    this.rpcService = deps.rpcService;
    this.db = deps.db;
    this.logger = deps.logger;
  }

  isPaused(): boolean {
    return this.isPausedState;
  }

  setPaused(val: boolean): void {
    this.isPausedState = val;
  }

  getAuditEvents(limit = 100): AuditRecord[] {
    return [...this.auditLogBuffer].reverse().slice(0, limit);
  }

  /**
   * Resolve a project ID to its owning online Runner ID.
   * Throws PROJECT_NOT_FOUND if project does not exist.
   * Throws PROJECT_DISABLED if project is marked disabled.
   * Throws RUNNER_OFFLINE if the runner is disconnected.
   */
  resolveProjectRunner(projectId: string): string {
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found or not registered`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is disabled`
      );
    }

    const connection = this.runnerRegistry.get(project.runnerId);
    if (!connection) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    return project.runnerId;
  }

  /**
   * Track which runner started a specific job and optionally persist to SQLite.
   */
  trackJob(jobId: string, runnerId: string): void {
    this.jobToRunnerMap.set(jobId, runnerId);
    // Bounded in-memory retention (keep up to 1000 jobs)
    if (this.jobToRunnerMap.size > 1000) {
      const oldestKey = this.jobToRunnerMap.keys().next().value;
      if (oldestKey) this.jobToRunnerMap.delete(oldestKey);
    }
  }

  /**
   * Record a job in memory and persistent SQLite jobs table.
   */
  recordJob(row: {
    id: string;
    projectId: string;
    runnerId: string;
    commandKind: string;
    risk?: string;
    state?: string;
    createdAt?: number;
    queuedAt?: number | null;
    startedAt?: number | null;
    finishedAt?: number | null;
    exitCode?: number | null;
    signal?: string | null;
    timeoutMs?: number | null;
    approvalId?: string | null;
  }): void {
    this.trackJob(row.id, row.runnerId);
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT INTO jobs (id, project_id, runner_id, command_kind, risk, state, created_at, queued_at, started_at, finished_at, exit_code, signal, timeout_ms, approval_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             state = excluded.state,
             queued_at = excluded.queued_at,
             started_at = excluded.started_at,
             finished_at = excluded.finished_at,
             exit_code = excluded.exit_code,
             signal = excluded.signal`
        )
        .run(
          row.id,
          row.projectId,
          row.runnerId,
          row.commandKind,
          row.risk ?? "SAFE",
          row.state ?? "queued",
          row.createdAt ?? Date.now(),
          row.queuedAt ?? null,
          row.startedAt ?? null,
          row.finishedAt ?? null,
          row.exitCode ?? null,
          row.signal ?? null,
          row.timeoutMs ?? null,
          row.approvalId ?? null
        );
    } catch (err) {
      this.logger?.warn({ err, jobId: row.id }, "Failed to record job in SQLite jobs table");
    }
  }

  /**
   * Resolve a job ID to its owning Runner ID.
   */
  resolveJobRunner(jobId: string): string {
    const runnerId = this.jobToRunnerMap.get(jobId);
    if (runnerId && this.runnerRegistry.get(runnerId)) {
      return runnerId;
    }

    if (this.db) {
      try {
        const row = this.db
          .prepare("SELECT runner_id FROM jobs WHERE id = ?")
          .get(jobId) as { runner_id: string } | undefined;
        if (row && row.runner_id && this.runnerRegistry.get(row.runner_id)) {
          return row.runner_id;
        }
      } catch {
        // ignore
      }
    }

    // If only one runner is connected, default to it
    const runners = this.runnerRegistry.list();
    if (runners.length === 1 && runners[0]) {
      return runners[0].id;
    }

    // Otherwise check if any active runner knows this job or throws
    if (runnerId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${runnerId}" for job "${jobId}" is offline`
      );
    }

    throw new LocalBridgeError(
      LocalBridgeErrorCode.JOB_NOT_FOUND,
      `Job "${jobId}" not found or unknown to connected runners`
    );
  }

  /**
   * Send a strongly typed RPC request to a runner.
   */
  async request<M extends keyof RunnerRpcMap>(
    runnerId: string,
    method: M,
    params: RunnerRpcMap[M]["params"]
  ): Promise<RunnerRpcMap[M]["result"]> {
    return this.rpcService.request(runnerId, method, params);
  }

  /**
   * Log an audit event with strict metadata sanitization.
   * NEVER logs raw tokens, hashes, diffs, patches, file content, or stdout/stderr.
   */
  logAudit(
    event: "mcp_tool_started" | "mcp_tool_completed" | "mcp_tool_failed",
    data: {
      principal?: McpPrincipal;
      toolName: string;
      projectId?: string;
      runnerId?: string;
      relativePath?: string;
      durationMs?: number;
      resultStatus?: "success" | "error";
      errorCode?: string;
      decisionSource?: string;
      policyLevel?: string;
      actorDisplayName?: string;
    }
  ): void {
    // Explicit whitelist construction - strictly drops any unlisted properties
    const record: SafeAuditMetadata = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      event,
      principalId: data.principal?.id,
      authType: data.principal?.authType,
      toolName: data.toolName,
      projectId: data.projectId,
      runnerId: data.runnerId,
      relativePath: data.relativePath,
      durationMs: data.durationMs,
      resultStatus: data.resultStatus,
      errorCode: data.errorCode,
      decisionSource: data.decisionSource,
      policyLevel: data.policyLevel,
      actorDisplayName: data.actorDisplayName,
    };
    this.auditLogBuffer.push(record);
    if (this.auditLogBuffer.length > this.maxAuditLogSize) {
      this.auditLogBuffer.shift();
    }

    this.logger?.info(
      {
        event,
        principalId: data.principal?.id,
        authType: data.principal?.authType,
        toolName: data.toolName,
        projectId: data.projectId,
        runnerId: data.runnerId,
        relativePath: data.relativePath,
        durationMs: data.durationMs,
        resultStatus: data.resultStatus,
        errorCode: data.errorCode,
        decisionSource: data.decisionSource,
        policyLevel: data.policyLevel,
        actorDisplayName: data.actorDisplayName,
      },
      `MCP tool [${data.toolName}]: ${event}`
    );
  }
}

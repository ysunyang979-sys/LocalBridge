import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type RunnerRpcMap,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { McpPrincipal } from "./types.js";

export interface McpContextDeps {
  projectService: ServerProjectService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
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
}

export type AuditRecord = SafeAuditMetadata;

export class McpContext {
  public readonly projectService: ServerProjectService;
  public readonly runnerRegistry: RunnerRegistry;
  public readonly rpcService: RunnerRpcService;
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
   * Track which runner started a specific job.
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
   * Resolve a job ID to its owning Runner ID.
   */
  resolveJobRunner(jobId: string): string {
    const runnerId = this.jobToRunnerMap.get(jobId);
    if (runnerId && this.runnerRegistry.get(runnerId)) {
      return runnerId;
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
      },
      `MCP tool [${data.toolName}]: ${event}`
    );
  }
}

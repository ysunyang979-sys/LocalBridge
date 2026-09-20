import type Database from "better-sqlite3";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type WorktreeCreateParams,
  type WorktreeCreateResult,
  type WorktreeListParams,
  type WorktreeListResult,
  type WorktreeStatusParams,
  type WorktreeStatusResult,
  type WorktreeDiffParams,
  type WorktreeDiffResult,
  type WorktreeRemoveParams,
  type WorktreeRemoveResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ManagedWorktreeRow } from "../db/schema.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { WorkflowSessionManager } from "../session/manager.js";

export interface ManagedWorktreeManagerDeps {
  db: Database.Database;
  projectService: ServerProjectService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  workflowSessionManager?: WorkflowSessionManager;
  logger?: Logger;
}

export class ManagedWorktreeManager {
  private readonly db: Database.Database;
  private readonly projectService: ServerProjectService;
  private readonly runnerRegistry: RunnerRegistry;
  private readonly rpcService: RunnerRpcService;
  private workflowSessionManager?: WorkflowSessionManager;
  private readonly logger?: Logger;

  constructor(deps: ManagedWorktreeManagerDeps) {
    this.db = deps.db;
    this.projectService = deps.projectService;
    this.runnerRegistry = deps.runnerRegistry;
    this.rpcService = deps.rpcService;
    this.workflowSessionManager = deps.workflowSessionManager;
    this.logger = deps.logger;
  }

  setWorkflowSessionManager(manager: WorkflowSessionManager): void {
    this.workflowSessionManager = manager;
  }

  /**
   * Get active worktree for a session, if any.
   */
  getActiveWorktreeForSession(sessionId: string): ManagedWorktreeRow | null {
    const row = this.db
      .prepare(
        "SELECT * FROM managed_worktrees WHERE session_id = ? AND state != 'removed' LIMIT 1"
      )
      .get(sessionId) as ManagedWorktreeRow | undefined;
    return row ?? null;
  }

  /**
   * Get worktree by ID.
   */
  getWorktreeById(worktreeId: string): ManagedWorktreeRow | null {
    const row = this.db
      .prepare("SELECT * FROM managed_worktrees WHERE id = ?")
      .get(worktreeId) as ManagedWorktreeRow | undefined;
    return row ?? null;
  }

  /**
   * 1. Create a managed worktree.
   */
  async createWorktree(
    params: WorktreeCreateParams & { approvalId?: string }
  ): Promise<WorktreeCreateResult> {
    const { projectId, sessionId } = params;
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }
    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is disabled`
      );
    }

    if (sessionId) {
      if (this.workflowSessionManager) {
        const session = this.workflowSessionManager.getSession(sessionId);
        if (session.state !== "active") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_NOT_ACTIVE,
            `Cannot bind worktree to session "${sessionId}" because it is ${session.state}`
          );
        }
      }

      // Check if session already has an active worktree
      const existing = this.getActiveWorktreeForSession(sessionId);
      if (existing) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.WORKTREE_ALREADY_EXISTS,
          `Session "${sessionId}" already has an active managed worktree ("${existing.id}")`
        );
      }
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    const result = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.WorktreeCreate,
      params
    );

    const now = Date.now();
    const worktreeId = result.worktreeId || (result as any).worktree?.id || (result as any).worktree?.worktreeId;
    const worktreePath = result.worktreePath || (result as any).worktree?.worktreeRoot || (result as any).worktree?.worktreePath;
    const branchName = result.branchName || (result as any).worktree?.branchName;
    const baseBranch = result.baseRef || (result as any).worktree?.baseRef || (result as any).worktree?.baseBranch;
    const baseCommit = result.baseCommit || (result as any).worktree?.baseCommit;
    const headCommit = result.headCommit || (result as any).worktree?.headCommit;

    const repositoryRoot = (result as any).repositoryRoot || (result as any).worktree?.repositoryRoot || "";
    this.db
      .prepare(
        `INSERT INTO managed_worktrees (
           id, project_id, session_id, repository_root, worktree_path, branch_name, base_ref, base_commit, head_commit, state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`
      )
      .run(
        worktreeId,
        projectId,
        sessionId ?? null,
        repositoryRoot,
        worktreePath,
        branchName,
        baseBranch ?? "HEAD",
        baseCommit ?? "",
        headCommit ?? "",
        now,
        now
      );

    if (sessionId && this.workflowSessionManager) {
      this.workflowSessionManager.recordProjectEvent({
        projectId,
        eventType: "WORKTREE_CREATED",
        source: "mcp",
        refType: "worktree",
        refId: worktreeId,
        summary: {
          worktreeId,
          branchName,
          worktreeRoot: worktreePath,
        },
      });
    }

    this.logger?.info(
      { worktreeId, projectId, branch: branchName },
      "Managed worktree created"
    );

    return {
      ...result,
      worktreeId,
      worktreePath,
      branchName,
      baseRef: baseBranch,
      baseCommit,
      headCommit,
      state: "ready",
      createdAt: now,
      worktree: {
        id: worktreeId,
        worktreeId,
        projectId,
        sessionId,
        worktreeRoot: worktreePath,
        worktreePath,
        branchName,
        baseRef: baseBranch,
        baseBranch,
        baseCommit,
        headCommit,
        isClean: true,
        state: "ready",
        createdAt: now,
      },
    } as any;
  }

  /**
   * 2. List managed worktrees for a project.
   */
  async listWorktrees(params: WorktreeListParams): Promise<WorktreeListResult> {
    const { projectId } = params;
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    const result = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.WorktreeList,
      params
    );

    // Synchronize sessionId from DB into runner results
    const rows = this.db
      .prepare("SELECT id, session_id FROM managed_worktrees WHERE project_id = ? AND state != 'removed'")
      .all(projectId) as Array<{ id: string; session_id: string | null }>;
    const sessionMap = new Map<string, string>();
    for (const r of rows) {
      if (r.session_id) sessionMap.set(r.id, r.session_id);
    }

    for (const wt of result.worktrees) {
      const wtId = wt.id ?? wt.worktreeId;
      if (wtId && !wt.sessionId && sessionMap.has(wtId)) {
        wt.sessionId = sessionMap.get(wtId);
      }
    }

    return result;
  }

  /**
   * 3. Get status of a managed worktree.
   */
  async getWorktreeStatus(params: WorktreeStatusParams): Promise<WorktreeStatusResult> {
    const row = params.worktreeId ? this.getWorktreeById(params.worktreeId) : undefined;
    const projectId = params.projectId ?? row?.project_id;
    if (!projectId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Worktree "${params.worktreeId}" not found in database`
      );
    }

    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    const result = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.WorktreeStatus,
      params
    );

    // Update DB record
    if (params.worktreeId) {
      this.db
        .prepare(
          `UPDATE managed_worktrees SET head_commit = ?, updated_at = ? WHERE id = ?`
        )
        .run(result.headCommit ?? null, Date.now(), params.worktreeId);
    }

    return result;
  }

  /**
   * 4. Get diff of a managed worktree.
   */
  async getWorktreeDiff(params: WorktreeDiffParams): Promise<WorktreeDiffResult> {
    const row = params.worktreeId ? this.getWorktreeById(params.worktreeId) : undefined;
    const projectId = params.projectId ?? row?.project_id;
    if (!projectId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Worktree "${params.worktreeId}" not found in database`
      );
    }

    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    return this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.WorktreeDiff,
      params
    );
  }

  /**
   * 5. Remove a managed worktree with strict safety checks.
   */
  async removeWorktree(
    params: WorktreeRemoveParams & { approvalId?: string }
  ): Promise<WorktreeRemoveResult> {
    const row = this.getWorktreeById(params.worktreeId);
    if (!row || row.state === "removed") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_NOT_FOUND,
        `Managed worktree "${params.worktreeId}" not found or already removed`
      );
    }

    const projectId = row.project_id;
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    // Safety pre-check 1: Check active jobs for this worktree / session
    const activeJobs = this.db
      .prepare(
        "SELECT id, command_kind, state FROM jobs WHERE project_id = ? AND state IN ('running', 'queued')"
      )
      .all(projectId) as Array<{ id: string; command_kind: string; state: string }>;

    if (activeJobs.length > 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_HAS_ACTIVE_JOBS,
        `Cannot remove worktree "${params.worktreeId}": ${activeJobs.length} active job(s) are running or queued. Stop or cancel them first.`
      );
    }

    // Safety pre-check 1b: Check active persistent runtimes for this worktree
    const activeRuntimes = this.db
      .prepare(
        "SELECT id, name, state FROM persistent_runtimes WHERE worktree_id = ? AND state IN ('starting', 'running', 'stopping')"
      )
      .all(params.worktreeId) as Array<{ id: string; name: string | null; state: string }>;

    if (activeRuntimes.length > 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.WORKTREE_HAS_ACTIVE_RUNTIMES,
        `Cannot remove worktree "${params.worktreeId}". It has ${activeRuntimes.length} active runtime(s): ${activeRuntimes.map((r) => r.name || r.id).join(", ")}. Stop all active runtimes first.`
      );
    }

    // Safety pre-check 2: Check pending approvals for this session
    if (row.session_id) {
      const pendingApprovalEvents = this.db
        .prepare(
          `SELECT ref_id FROM workflow_session_events
           WHERE session_id = ? AND event_type IN ('APPROVAL_CREATED', 'APPROVAL_REQUESTED')
           AND ref_id NOT IN (
             SELECT ref_id FROM workflow_session_events
             WHERE session_id = ? AND event_type IN ('APPROVAL_APPROVED', 'APPROVAL_DENIED', 'APPROVAL_CONSUMED', 'APPROVAL_EXPIRED')
           )`
        )
        .all(row.session_id, row.session_id) as Array<{ ref_id: string }>;

      if (pendingApprovalEvents.length > 0) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.WORKTREE_HAS_PENDING_APPROVALS,
          `Cannot remove worktree "${params.worktreeId}": ${pendingApprovalEvents.length} pending approval(s) exist for this session. Resolve them first.`
        );
      }
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    const result = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.WorktreeRemove,
      params
    );

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE managed_worktrees SET state = 'removed', removed_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(now, now, params.worktreeId);

    if (row.session_id && this.workflowSessionManager) {
      this.workflowSessionManager.recordProjectEvent({
        projectId,
        eventType: "WORKTREE_REMOVED",
        source: "mcp",
        refType: "worktree",
        refId: params.worktreeId,
        summary: {
          worktreeId: params.worktreeId,
          branchName: row.branch_name,
        },
      });
    }

    this.logger?.info(
      { worktreeId: params.worktreeId, projectId, branch: row.branch_name },
      "Managed worktree removed"
    );

    return result;
  }
}

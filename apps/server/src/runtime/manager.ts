import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type RuntimeStartParams,
  type RuntimeStartResult,
  type RuntimeListParams,
  type RuntimeListResult,
  type RuntimeStatusParams,
  type RuntimeStatusResult,
  type RuntimeLogsParams,
  type RuntimeLogsResult,
  type RuntimeRestartParams,
  type RuntimeRestartResult,
  type RuntimeStopParams,
  type RuntimeStopResult,
  type RuntimeSummary,
  type RuntimeState,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { PersistentRuntimeRow } from "../db/schema.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";

export interface ServerPersistentRuntimeManagerDeps {
  db: Database.Database;
  projectService: ServerProjectService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  logger?: Logger;
}

export class ServerPersistentRuntimeManager {
  private readonly db: Database.Database;
  private readonly projectService: ServerProjectService;
  private readonly runnerRegistry: RunnerRegistry;
  private readonly rpcService: RunnerRpcService;
  private readonly logger?: Logger;

  constructor(deps: ServerPersistentRuntimeManagerDeps) {
    this.db = deps.db;
    this.projectService = deps.projectService;
    this.runnerRegistry = deps.runnerRegistry;
    this.rpcService = deps.rpcService;
    this.logger = deps.logger;
  }

  /**
   * Start a new persistent runtime.
   */
  async startRuntime(
    params: RuntimeStartParams & { createdBy?: "chat" | "desktop" }
  ): Promise<RuntimeStartResult> {
    const project = this.projectService.getProject(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${params.projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${params.projectId}" is disabled`
      );
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${params.projectId}" is offline`
      );
    }

    const res = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.RuntimeStart,
      params
    );

    const now = Date.now();
    const commandCategory =
      params.launch.kind === "package-script" ? "package-script" : "dev-server";

    this.db
      .prepare(
        `INSERT INTO persistent_runtimes (
          id, project_id, session_id, worktree_id, name, kind, command_category,
          state, generation, launch_spec_json, workspace_mode, pid, exit_code,
          signal, restart_count, last_error_code, last_error, created_at, started_at,
          stopped_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        res.runtimeId,
        params.projectId,
        params.sessionId ?? null,
        res.worktreeId ?? null,
        res.name ?? null,
        params.launch.kind,
        commandCategory,
        res.state,
        res.generation,
        JSON.stringify(params.launch),
        res.workspaceMode,
        null,
        null,
        null,
        0,
        null,
        null,
        res.createdAt,
        now,
        null,
        now,
        params.createdBy ?? "chat"
      );

    this.db
      .prepare(
        `INSERT INTO runtime_generations (
          id, runtime_id, generation, pid, state, exit_code, signal, started_at, stopped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        res.runtimeId,
        res.generation,
        null,
        res.state,
        null,
        null,
        now,
        null
      );

    return res;
  }

  /**
   * List persistent runtimes.
   */
  async listRuntimes(params: RuntimeListParams): Promise<RuntimeListResult> {
    if (params.projectId) {
      const project = this.projectService.getProject(params.projectId);
      if (project && this.runnerRegistry.has(project.runnerId)) {
        try {
          const res = await this.rpcService.request(
            project.runnerId,
            RunnerRpcMethods.RuntimeList,
            params
          );

          // Synchronize returned runtimes to SQLite
          for (const item of res.runtimes) {
            this.db
              .prepare(
                `UPDATE persistent_runtimes SET
                  state = ?, generation = ?, pid = ?, exit_code = ?, signal = ?,
                  restart_count = ?, last_error_code = ?, last_error = ?,
                  started_at = ?, stopped_at = ?, updated_at = ?
                WHERE id = ?`
              )
              .run(
                item.state,
                item.generation,
                item.pid ?? null,
                item.exitCode ?? null,
                item.signal ?? null,
                item.restartCount,
                item.lastErrorCode ?? null,
                item.lastError ?? null,
                item.startedAt ?? null,
                item.stoppedAt ?? null,
                item.updatedAt,
                item.runtimeId
              );
          }

          return res;
        } catch (err) {
          this.logger?.warn({ err }, "Failed to fetch live runtimes from runner, falling back to db");
        }
      }
    }

    // Fallback or multi-project query from DB
    let query = "SELECT * FROM persistent_runtimes WHERE 1=1";
    const queryParams: any[] = [];

    if (params.projectId) {
      query += " AND project_id = ?";
      queryParams.push(params.projectId);
    }
    if (params.sessionId) {
      query += " AND session_id = ?";
      queryParams.push(params.sessionId);
    }
    if (params.worktreeId) {
      query += " AND worktree_id = ?";
      queryParams.push(params.worktreeId);
    }
    if (params.state) {
      query += " AND state = ?";
      queryParams.push(params.state);
    }

    query += " ORDER BY created_at DESC";

    const rows = this.db.prepare(query).all(...queryParams) as PersistentRuntimeRow[];

    const limit = params.limit ?? 50;
    let startIndex = 0;
    if (params.cursor) {
      try {
        const decoded = Buffer.from(params.cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(decoded);
        if (typeof parsed.lastIndex === "number") {
          startIndex = parsed.lastIndex + 1;
        }
      } catch {}
    }

    const paged = rows.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < rows.length;
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = Buffer.from(
        JSON.stringify({ lastIndex: startIndex + limit - 1 })
      ).toString("base64url");
    }

    const summaries: RuntimeSummary[] = paged.map((r) => this.rowToSummary(r));

    return {
      runtimes: summaries,
      total: rows.length,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get status of a persistent runtime.
   */
  async getRuntimeStatus(params: RuntimeStatusParams): Promise<RuntimeStatusResult> {
    const row = this.db
      .prepare("SELECT * FROM persistent_runtimes WHERE id = ?")
      .get(params.runtimeId) as PersistentRuntimeRow | undefined;

    if (!row) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime "${params.runtimeId}" not found`
      );
    }

    const project = this.projectService.getProject(row.project_id);
    if (project && this.runnerRegistry.has(project.runnerId)) {
      try {
        const res = await this.rpcService.request(
          project.runnerId,
          RunnerRpcMethods.RuntimeStatus,
          params
        );

        this.db
          .prepare(
            `UPDATE persistent_runtimes SET
              state = ?, generation = ?, pid = ?, exit_code = ?, signal = ?,
              restart_count = ?, last_error_code = ?, last_error = ?,
              started_at = ?, stopped_at = ?, updated_at = ?
            WHERE id = ?`
          )
          .run(
            res.state,
            res.generation,
            res.pid ?? null,
            res.exitCode ?? null,
            res.signal ?? null,
            res.restartCount,
            res.lastErrorCode ?? null,
            res.lastError ?? null,
            res.startedAt ?? null,
            res.stoppedAt ?? null,
            res.updatedAt,
            res.runtimeId
          );

        return res;
      } catch (err) {
        this.logger?.warn({ err }, "Failed to fetch live runtime status, returning db record");
      }
    }

    return this.rowToSummary(row);
  }

  /**
   * Get paginated logs for a persistent runtime.
   */
  async getRuntimeLogs(params: RuntimeLogsParams): Promise<RuntimeLogsResult> {
    const row = this.db
      .prepare("SELECT * FROM persistent_runtimes WHERE id = ?")
      .get(params.runtimeId) as PersistentRuntimeRow | undefined;

    if (!row) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime "${params.runtimeId}" not found`
      );
    }

    const project = this.projectService.getProject(row.project_id);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${row.project_id}" not found`
      );
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${row.project_id}" is offline`
      );
    }

    return this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.RuntimeLogs,
      params
    );
  }

  /**
   * Restart a persistent runtime.
   */
  async restartRuntime(params: RuntimeRestartParams): Promise<RuntimeRestartResult> {
    const row = this.db
      .prepare("SELECT * FROM persistent_runtimes WHERE id = ?")
      .get(params.runtimeId) as PersistentRuntimeRow | undefined;

    if (!row) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime "${params.runtimeId}" not found`
      );
    }

    const project = this.projectService.getProject(row.project_id);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${row.project_id}" not found`
      );
    }

    const runnerConn = this.runnerRegistry.get(project.runnerId);
    if (!runnerConn) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${row.project_id}" is offline`
      );
    }

    const res = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.RuntimeRestart,
      params
    );

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE persistent_runtimes SET
          state = ?, generation = ?, pid = ?, restart_count = restart_count + 1,
          started_at = ?, stopped_at = NULL, exit_code = NULL, signal = NULL,
          last_error_code = NULL, last_error = NULL, updated_at = ?
        WHERE id = ?`
      )
      .run(res.state, res.generation, res.pid ?? null, res.restartedAt, now, row.id);

    this.db
      .prepare(
        `INSERT INTO runtime_generations (
          id, runtime_id, generation, pid, state, exit_code, signal, started_at, stopped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        row.id,
        res.generation,
        res.pid ?? null,
        res.state,
        null,
        null,
        res.restartedAt,
        null
      );

    return res;
  }

  /**
   * Stop a persistent runtime.
   */
  async stopRuntime(params: RuntimeStopParams): Promise<RuntimeStopResult> {
    const row = this.db
      .prepare("SELECT * FROM persistent_runtimes WHERE id = ?")
      .get(params.runtimeId) as PersistentRuntimeRow | undefined;

    if (!row) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime "${params.runtimeId}" not found`
      );
    }

    if (
      row.state === "stopped" ||
      row.state === "failed" ||
      row.state === "interrupted"
    ) {
      return {
        runtimeId: row.id,
        state: row.state as RuntimeState,
        stopped: true,
        stoppedAt: row.stopped_at ?? Date.now(),
      };
    }

    const project = this.projectService.getProject(row.project_id);
    if (!project || !this.runnerRegistry.has(project.runnerId)) {
      const now = Date.now();
      this.db
        .prepare(
          `UPDATE persistent_runtimes SET state = 'stopped', stopped_at = ?, pid = NULL, updated_at = ? WHERE id = ?`
        )
        .run(now, now, row.id);

      return {
        runtimeId: row.id,
        state: "stopped",
        stopped: true,
        stoppedAt: now,
      };
    }

    const res = await this.rpcService.request(
      project.runnerId,
      RunnerRpcMethods.RuntimeStop,
      params
    );

    this.db
      .prepare(
        `UPDATE persistent_runtimes SET state = ?, stopped_at = ?, pid = NULL, updated_at = ? WHERE id = ?`
      )
      .run(res.state, res.stoppedAt, Date.now(), row.id);

    this.db
      .prepare(
        `UPDATE runtime_generations SET state = ?, stopped_at = ? WHERE runtime_id = ? AND generation = ?`
      )
      .run(res.state, res.stoppedAt, row.id, row.generation);

    return res;
  }

  hasActiveRuntimesForWorktree(worktreeId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM persistent_runtimes
         WHERE worktree_id = ? AND state IN ('starting', 'running', 'stopping')`
      )
      .get(worktreeId) as { count: number };
    return row.count > 0;
  }

  hasActiveRuntimesForSession(sessionId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM persistent_runtimes
         WHERE session_id = ? AND state IN ('starting', 'running', 'stopping')`
      )
      .get(sessionId) as { count: number };
    return row.count > 0;
  }

  getActiveRuntimesForSession(sessionId: string): PersistentRuntimeRow[] {
    return this.db
      .prepare(
        `SELECT * FROM persistent_runtimes
         WHERE session_id = ? AND state IN ('starting', 'running', 'stopping')`
      )
      .all(sessionId) as PersistentRuntimeRow[];
  }

  private rowToSummary(r: PersistentRuntimeRow): RuntimeSummary {
    const uptimeMs =
      r.started_at && !r.stopped_at ? Date.now() - r.started_at : undefined;

    return {
      runtimeId: r.id,
      name: r.name ?? undefined,
      state: r.state as RuntimeState,
      generation: r.generation,
      projectId: r.project_id,
      sessionId: r.session_id ?? undefined,
      worktreeId: r.worktree_id ?? undefined,
      kind: r.kind as "package-script" | "registered-command",
      commandCategory: r.command_category,
      workspaceMode: r.workspace_mode as "direct" | "managed-worktree",
      startedAt: r.started_at,
      stoppedAt: r.stopped_at,
      uptimeMs,
      pid: r.pid,
      exitCode: r.exit_code,
      signal: r.signal,
      restartCount: r.restart_count,
      lastErrorCode: r.last_error_code,
      lastError: r.last_error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

import type Database from "better-sqlite3";
import type { ProjectListItem, ProjectPublic } from "@localbridge/protocol";
import type { ProjectRow } from "../db/schema.js";
import type { RunnerRegistry } from "./registry.js";
import type { Logger } from "@localbridge/shared";

export class ServerProjectService {
  private readonly stmtUpsertProject: Database.Statement;
  private readonly stmtListProjects: Database.Statement;
  private readonly stmtGetProject: Database.Statement;

  constructor(
    private readonly db: Database.Database,
    private readonly runnerRegistry: RunnerRegistry,
    private readonly logger?: Logger
  ) {
    this.stmtUpsertProject = this.db.prepare(`
      INSERT INTO projects (id, runner_id, name, enabled, access_mode, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        runner_id = excluded.runner_id,
        name = excluded.name,
        enabled = excluded.enabled,
        access_mode = excluded.access_mode,
        last_seen_at = excluded.last_seen_at
    `);
    this.stmtListProjects = this.db.prepare(
      "SELECT * FROM projects ORDER BY first_seen_at ASC"
    );
    this.stmtGetProject = this.db.prepare(
      "SELECT * FROM projects WHERE id = ?"
    );
  }

  /**
   * Synchronize public project metadata reported by a connected Runner.
   * Strictly stores only ID, name, enabled status, and timestamps. Zero physical paths.
   */
  syncRunnerProjects(runnerId: string, projects: ProjectListItem[]): void {
    if (!this.db.open) return;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      for (const p of projects) {
        this.stmtUpsertProject.run(
          p.id,
          runnerId,
          p.name,
          p.enabled ? 1 : 0,
          p.accessMode ?? "read-only",
          now,
          now
        );
      }
    });

    tx();

    this.logger?.info(
      {
        event: "runner_projects_synced",
        runner_id: runnerId,
        project_count: projects.length,
      },
      `Synchronized ${projects.length} public projects for runner "${runnerId}"`
    );
  }

  /**
   * List all projects known to the server with dynamic availability.
   * A project is available only if its associated Runner is currently online and the project is enabled.
   */
  listProjects(): ProjectPublic[] {
    if (!this.db.open) return [];
    const rows = this.stmtListProjects.all() as ProjectRow[];

    return rows.map((row) => {
      const runnerOnline = this.runnerRegistry.get(row.runner_id) !== undefined;
      const isEnabled = Boolean(row.enabled);

      return {
        id: row.id,
        runnerId: row.runner_id,
        name: row.name,
        enabled: isEnabled,
        available: runnerOnline && isEnabled,
        accessMode: row.access_mode === "read-write" ? "read-write" : "read-only",
      };
    });
  }

  /**
   * Get public project details by ID with dynamic availability.
   */
  getProject(projectId: string): ProjectPublic | undefined {
    if (!this.db.open) return undefined;
    const row = this.stmtGetProject.get(projectId) as ProjectRow | undefined;

    if (!row) {
      return undefined;
    }

    const runnerOnline = this.runnerRegistry.get(row.runner_id) !== undefined;
    const isEnabled = Boolean(row.enabled);

    return {
      id: row.id,
      runnerId: row.runner_id,
      name: row.name,
      enabled: isEnabled,
      available: runnerOnline && isEnabled,
      accessMode: row.access_mode === "read-write" ? "read-write" : "read-only",
    };
  }
}

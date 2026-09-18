import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  initDatabase,
  getCurrentSchemaVersion,
  runMigrations,
  type TokenRow,
  type ProjectRow,
} from "../apps/server/src/db/index.js";
import { generateMcpToken, hashToken } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Database Migrations & Persistence", () => {
  let tmpDir: string;
  let dbFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-db-test-"));
    dbFilePath = path.join(tmpDir, "test.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("applies migrations and tracks schema_migrations correctly", () => {
    const conn = initDatabase(dbFilePath, migrationsDir);

    try {
      expect(conn.migrationResult.appliedCount).toBe(3);
      expect(conn.migrationResult.currentVersion).toBe(3);
      expect(conn.migrationResult.appliedMigrations).toContain("0001_initial.sql");
      expect(conn.migrationResult.appliedMigrations).toContain("0002_projects_metadata.sql");
      expect(conn.migrationResult.appliedMigrations).toContain("0003_projects_access_mode.sql");
      expect(getCurrentSchemaVersion(conn.db)).toBe(3);

      // Verify tables exist
      const tables = (
        conn.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
          )
          .all() as Array<{ name: string }>
      ).map((r) => r.name);

      expect(tables).toContain("schema_migrations");
      expect(tables).toContain("tokens");
      expect(tables).toContain("runners");
      expect(tables).toContain("projects");
      expect(tables).toContain("audit_logs");

      // Verify projects table has no 'root' column and has 'access_mode'
      const columns = (
        conn.db
          .prepare("PRAGMA table_info(projects)")
          .all() as Array<{ name: string }>
      ).map((c) => c.name);
      expect(columns).not.toContain("root");
      expect(columns).toContain("runner_id");
      expect(columns).toContain("name");
      expect(columns).toContain("enabled");
      expect(columns).toContain("access_mode");
    } finally {
      conn.close();
    }
  });

  it("is idempotent when running migrations multiple times", () => {
    const conn1 = initDatabase(dbFilePath, migrationsDir);
    try {
      expect(conn1.migrationResult.appliedCount).toBe(3);
    } finally {
      conn1.close();
    }

    const conn2 = initDatabase(dbFilePath, migrationsDir);
    try {
      expect(conn2.migrationResult.appliedCount).toBe(0);
      expect(conn2.migrationResult.currentVersion).toBe(3);
    } finally {
      conn2.close();
    }
  });

  it("persists token and project metadata across database reconnections", () => {
    const rawToken = generateMcpToken();
    const tokenHash = hashToken(rawToken);

    // Session 1: Insert token and project
    const conn1 = initDatabase(dbFilePath, migrationsDir);
    conn1.db
      .prepare(
        `INSERT INTO tokens (id, type, token_hash, name, scopes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("tok_1", "mcp", tokenHash, "Test MCP Client", "[]", Date.now());

    conn1.db
      .prepare(
        `INSERT INTO projects (id, runner_id, name, enabled, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("proj_1", "runner_1", "my-blog", 1, Date.now(), Date.now());

    conn1.close();

    // Session 2: Reopen and read data
    const conn2 = initDatabase(dbFilePath, migrationsDir);
    const token = conn2.db
      .prepare("SELECT * FROM tokens WHERE id = ?")
      .get("tok_1") as TokenRow | undefined;

    expect(token).toBeDefined();
    expect(token?.type).toBe("mcp");
    expect(token?.token_hash).toBe(tokenHash);

    const project = conn2.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get("proj_1") as ProjectRow | undefined;

    expect(project).toBeDefined();
    expect(project?.name).toBe("my-blog");
    expect(project?.runner_id).toBe("runner_1");
    expect((project as Record<string, unknown>).root).toBeUndefined();

    conn2.close();
  });
});

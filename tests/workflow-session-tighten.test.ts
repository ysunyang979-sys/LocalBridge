import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("../apps/server/node_modules/better-sqlite3");
import {
  SessionStartParamsSchema,
  SessionCheckpointParamsSchema,
  SessionFinishParamsSchema,
  SessionListParamsSchema,
  SessionStatusParamsSchema,
  SessionEventsParamsSchema,
  SessionHandoffParamsSchema,
  WorkflowSessionStateSchema,
  WorkflowSessionOutcomeSchema,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import {
  MCP_TOOL_SCOPE,
  requiredScopeForTool,
  hasToolScope,
} from "../apps/server/src/mcp/scope-policy.js";
import { toMcpSchema } from "../apps/server/src/mcp/schema.js";
import { runMigrations } from "../apps/server/src/db/migrate.js";
import { WorkflowSessionManager } from "../apps/server/src/session/manager.js";

describe("P3-B Workflow Session Contract Tightening", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-tighten-test-"));
    dbPath = path.join(tmpDir, "tighten.db");
    db = new Database(dbPath);
    runMigrations(db);
  });

  afterEach(() => {
    if (db && db.open) db.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 1. Session Token Scope: Nexus Unified Permission Model
  // =========================================================================
  describe("1. Token Scope Mapping & Permissions", () => {
    it("maps session read tools to 'read' and session write tools to 'write'", () => {
      // Read tools -> read
      expect(requiredScopeForTool("localbridge_session_list")).toBe("read");
      expect(requiredScopeForTool("localbridge_session_status")).toBe("read");
      expect(requiredScopeForTool("localbridge_session_events")).toBe("read");
      expect(requiredScopeForTool("localbridge_session_handoff")).toBe("read");

      // Write tools -> write
      expect(requiredScopeForTool("localbridge_session_start")).toBe("write");
      expect(requiredScopeForTool("localbridge_session_checkpoint")).toBe("write");
      expect(requiredScopeForTool("localbridge_session_finish")).toBe("write");
    });

    it("verifies no session:read or session:write scopes exist", () => {
      const allScopes = Object.values(MCP_TOOL_SCOPE);
      for (const scope of allScopes) {
        expect(scope).not.toBe("session:read");
        expect(scope).not.toBe("session:write");
        expect(["read", "write", "execute"]).toContain(scope);
      }
    });

    it("enforces scope authorization with hasToolScope", () => {
      const readOnlyScopes = ["read"];
      const writeOnlyScopes = ["write"];

      // Read tools
      expect(hasToolScope(readOnlyScopes, "localbridge_session_list")).toBe(true);
      expect(hasToolScope(readOnlyScopes, "localbridge_session_status")).toBe(true);
      expect(hasToolScope(readOnlyScopes, "localbridge_session_events")).toBe(true);
      expect(hasToolScope(readOnlyScopes, "localbridge_session_handoff")).toBe(true);

      // Write tools denied with read-only scope
      expect(hasToolScope(readOnlyScopes, "localbridge_session_start")).toBe(false);
      expect(hasToolScope(readOnlyScopes, "localbridge_session_checkpoint")).toBe(false);
      expect(hasToolScope(readOnlyScopes, "localbridge_session_finish")).toBe(false);

      // Write tools allowed with write scope
      expect(hasToolScope(writeOnlyScopes, "localbridge_session_start")).toBe(true);
      expect(hasToolScope(writeOnlyScopes, "localbridge_session_checkpoint")).toBe(true);
      expect(hasToolScope(writeOnlyScopes, "localbridge_session_finish")).toBe(true);

      // Read tools denied with write-only scope
      expect(hasToolScope(writeOnlyScopes, "localbridge_session_list")).toBe(false);
      expect(hasToolScope(writeOnlyScopes, "localbridge_session_status")).toBe(false);
    });
  });

  // =========================================================================
  // 2. Tightened Metadata & Strict Schemas (additionalProperties: false)
  // =========================================================================
  describe("2. Tightened Metadata & Schema Validation", () => {
    it("SessionStartParamsSchema accepts valid typed metadata and rejects arbitrary metadata", () => {
      // Valid input
      const valid = SessionStartParamsSchema.safeParse({
        projectId: "proj_123",
        goal: "Build feature",
        metadata: {
          source: "chat",
          clientLabel: "vscode-plugin",
        },
      });
      expect(valid.success).toBe(true);

      // Arbitrary extra property outside schema rejected (.strict())
      const extraProp = SessionStartParamsSchema.safeParse({
        projectId: "proj_123",
        arbitraryKey: "not allowed",
      });
      expect(extraProp.success).toBe(false);

      // Arbitrary nested property in metadata rejected (.strict())
      const arbitraryMeta = SessionStartParamsSchema.safeParse({
        projectId: "proj_123",
        metadata: {
          source: "chat",
          arbitraryNested: { nested: true },
        },
      });
      expect(arbitraryMeta.success).toBe(false);

      // String length limit on metadata fields
      const oversizedMeta = SessionStartParamsSchema.safeParse({
        projectId: "proj_123",
        metadata: {
          source: "a".repeat(101),
        },
      });
      expect(oversizedMeta.success).toBe(false);
    });

    it("SessionCheckpointParamsSchema rejects arbitrary metadata and properties", () => {
      // Valid input
      const valid = SessionCheckpointParamsSchema.safeParse({
        sessionId: "session_123",
        summary: "Reached milestone 1",
        metadata: {
          source: "desktop",
          clientLabel: "localbridge-ui",
        },
      });
      expect(valid.success).toBe(true);

      // Arbitrary metadata rejected
      const arbitraryMeta = SessionCheckpointParamsSchema.safeParse({
        sessionId: "session_123",
        summary: "Reached milestone 1",
        metadata: {
          customJson: { x: 1, y: 2 },
        },
      });
      expect(arbitraryMeta.success).toBe(false);

      // Arbitrary root property rejected
      const extraProp = SessionCheckpointParamsSchema.safeParse({
        sessionId: "session_123",
        summary: "Reached milestone 1",
        unknownProp: 42,
      });
      expect(extraProp.success).toBe(false);
    });

    it("verifies zodToJsonSchema generates additionalProperties: false on all session schemas", () => {
      const { zodToJsonSchema } = require("zod-to-json-schema");
      const schemas = [
        SessionStartParamsSchema,
        SessionListParamsSchema,
        SessionStatusParamsSchema,
        SessionEventsParamsSchema,
        SessionCheckpointParamsSchema,
        SessionHandoffParamsSchema,
        SessionFinishParamsSchema,
      ];

      for (const zodSchema of schemas) {
        const jsonSchema = zodToJsonSchema(zodSchema) as any;
        expect(jsonSchema.additionalProperties).toBe(false);
      }
    });
  });

  // =========================================================================
  // 3. Simplified State Machine: active, completed, abandoned
  // =========================================================================
  describe("3. Simplified State Machine & Terminal Immutability", () => {
    it("validates allowed states (active, completed, abandoned) and outcome schema", () => {
      expect(WorkflowSessionStateSchema.options).toEqual(["active", "completed", "abandoned"]);
      expect(WorkflowSessionOutcomeSchema.options).toEqual(["completed", "abandoned"]);

      // paused and aborted are invalid
      expect(WorkflowSessionStateSchema.safeParse("paused").success).toBe(false);
      expect(WorkflowSessionStateSchema.safeParse("aborted").success).toBe(false);
      expect(WorkflowSessionOutcomeSchema.safeParse("paused").success).toBe(false);
      expect(WorkflowSessionOutcomeSchema.safeParse("aborted").success).toBe(false);
    });

    it("executes active -> completed transition", () => {
      const manager = new WorkflowSessionManager({
        db,
        projectService: {
          getProject: () => ({ id: "p1", name: "P1", enabled: true } as any),
        } as any,
        runnerRegistry: {} as any,
        rpcService: {} as any,
      });

      const started = manager.startSession({ projectId: "p1", goal: "Complete me" });
      expect(started.state).toBe("active");

      const finished = manager.finishSession({
        sessionId: started.sessionId,
        outcome: "completed",
        finalNote: "All tests passing",
      });
      expect(finished.state).toBe("completed");

      // Verify cannot finish again (terminal session)
      expect(() =>
        manager.finishSession({
          sessionId: started.sessionId,
          outcome: "completed",
        })
      ).toThrowError(/already completed/i);
    });

    it("executes active -> abandoned transition", () => {
      const manager = new WorkflowSessionManager({
        db,
        projectService: {
          getProject: () => ({ id: "p2", name: "P2", enabled: true } as any),
        } as any,
        runnerRegistry: {} as any,
        rpcService: {} as any,
      });

      const started = manager.startSession({ projectId: "p2", goal: "Abandon me" });
      expect(started.state).toBe("active");

      const finished = manager.finishSession({
        sessionId: started.sessionId,
        outcome: "abandoned",
        reason: "User cancelled task",
      });
      expect(finished.state).toBe("abandoned");

      // Verify cannot add checkpoint to abandoned session
      expect(() =>
        manager.addCheckpoint({
          sessionId: started.sessionId,
          summary: "Late checkpoint",
        })
      ).toThrowError(/because it is abandoned/i);
    });
  });

  // =========================================================================
  // 4. Database Migration & Legacy Compatibility (aborted/paused -> abandoned)
  // =========================================================================
  describe("4. Database Migration Compatibility & SQLite Triggers", () => {
    it("migrates legacy aborted and paused records to abandoned cleanly", () => {
      // Create a legacy database applying only migrations 0001 through 0007
      const legacyDbPath = path.join(tmpDir, "legacy.db");
      const legacyDb = new Database(legacyDbPath);

      const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql") && !f.startsWith("0008_"))
        .sort();

      legacyDb.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        );
      `);

      for (const file of files) {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match) continue;
        const version = Number.parseInt(match[1]!, 10);
        const name = match[2]!;
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        legacyDb.exec(sql);
        legacyDb
          .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(version, name, Date.now());
      }

      // Insert legacy rows into 0007 schema
      const now = Date.now();
      legacyDb.prepare(
        `INSERT INTO workflow_sessions (
           id, project_id, goal, state, created_at, updated_at, last_activity_at, created_by, event_count, events_truncated
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      ).run("session_legacy_aborted", "p_legacy", "Old task", "aborted", now, now, now, "chat");

      legacyDb.prepare(
        `INSERT INTO workflow_sessions (
           id, project_id, goal, state, created_at, updated_at, last_activity_at, created_by, event_count, events_truncated
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      ).run("session_legacy_paused", "p_legacy_2", "Paused task", "paused", now, now, now, "chat");

      // Now run remaining migrations (which applies 0008)
      runMigrations(legacyDb, migrationsDir);

      // Check legacy aborted -> abandoned
      const rowAborted = legacyDb
        .prepare("SELECT * FROM workflow_sessions WHERE id = ?")
        .get("session_legacy_aborted") as any;
      expect(rowAborted.state).toBe("abandoned");
      expect(rowAborted.finish_reason).toBe("migrated_legacy_aborted");
      expect(rowAborted.finished_at).toBeTruthy();

      // Check legacy paused -> abandoned
      const rowPaused = legacyDb
        .prepare("SELECT * FROM workflow_sessions WHERE id = ?")
        .get("session_legacy_paused") as any;
      expect(rowPaused.state).toBe("abandoned");
      expect(rowPaused.finish_reason).toBe("migrated_legacy_paused");
      expect(rowPaused.finished_at).toBeTruthy();

      legacyDb.close();
    });

    it("triggers reject inserting invalid states (paused, aborted, unknown)", () => {
      const now = Date.now();
      expect(() => {
        db.prepare(
          `INSERT INTO workflow_sessions (
             id, project_id, goal, state, created_at, updated_at, last_activity_at, created_by, event_count, events_truncated
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
        ).run("session_invalid", "p_inv", "Bad task", "paused", now, now, now, "chat");
      }).toThrowError(/Invalid workflow_session state/i);

      expect(() => {
        db.prepare(
          `INSERT INTO workflow_sessions (
             id, project_id, goal, state, created_at, updated_at, last_activity_at, created_by, event_count, events_truncated
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
        ).run("session_invalid_2", "p_inv", "Bad task", "aborted", now, now, now, "chat");
      }).toThrowError(/Invalid workflow_session state/i);
    });

    it("triggers reject updating terminal session state", () => {
      const now = Date.now();
      // Insert valid completed session
      db.prepare(
        `INSERT INTO workflow_sessions (
           id, project_id, goal, state, created_at, updated_at, last_activity_at, created_by, event_count, events_truncated
         ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, 0, 0)`
      ).run("session_term", "p_term", "Done task", now, now, now, "chat");

      // Attempt to reopen or transition
      expect(() => {
        db.prepare("UPDATE workflow_sessions SET state = 'active' WHERE id = ?").run("session_term");
      }).toThrowError(/Cannot transition a terminal workflow_session/i);
    });
  });
});

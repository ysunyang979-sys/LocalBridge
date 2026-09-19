import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("../apps/server/node_modules/better-sqlite3");
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  RunnerRpcSchemas,
  type ProjectTrustPolicy,
} from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createProjectSetTrustPolicyHandler } from "../apps/runner/src/rpc/handlers/project-set-trust-policy.js";
import { createProjectSessionTrustHandler } from "../apps/runner/src/rpc/handlers/project-session-trust.js";
import { ServerProjectService } from "../apps/server/src/runner/project-service.js";

describe("Project Trust & Approval Policy - RPC & Integration Suite", () => {
  let tmpDir: string;
  let projectDir: string;
  let registry: ProjectRegistry;
  let projectId: string;
  let db: any;
  let projectService: ServerProjectService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-rpc-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "Myweb" });
    registry.setAccessMode(proj.id, "read-write");
    projectId = proj.id;

    const dbPath = path.join(tmpDir, "server.db");
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        runner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        access_mode TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_trust_policies (
        project_id TEXT PRIMARY KEY,
        trust_level TEXT NOT NULL DEFAULT 'standard',
        file_policy TEXT NOT NULL DEFAULT 'standard',
        command_policy TEXT NOT NULL DEFAULT 'ask',
        protected_files_policy TEXT NOT NULL DEFAULT 'always-ask',
        custom_rules TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    projectService = new ServerProjectService(db, { get: () => ({}) } as any);
    projectService.syncRunnerProjects("runner_local", [
      {
        id: proj.id,
        name: proj.name,
        enabled: true,
        accessMode: "read-write",
      },
    ]);
  });

  afterEach(() => {
    if (db && db.open) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("1. RPC Schema Validation (RunnerRpcSchemas.project.setTrustPolicy)", () => {
    const schema = RunnerRpcSchemas[RunnerRpcMethods.ProjectSetTrustPolicy].params;

    it("Standard + Always Ask -> PASS", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "standard",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(parsed.success).toBe(true);
    });

    it("Session Trusted + Always Ask -> PASS", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "session-trusted",
        filePolicy: "allow",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(parsed.success).toBe(true);
    });

    it("Full Project Trust + Always Ask -> PASS", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "full-project-trust",
        filePolicy: "allow",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(parsed.success).toBe(true);
    });

    it("Full Project Trust + Follow Project Trust (follow-policy) -> PASS", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "full-project-trust",
        filePolicy: "allow",
        commandPolicy: "ask",
        protectedFilesPolicy: "follow-policy",
      });
      expect(parsed.success).toBe(true);
    });

    it("Custom + valid matrix -> PASS", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "custom",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
        customRules: {
          files: {
            read: "allow",
            create: "allow",
            write: "allow",
            patch: "allow",
            delete: "ask",
            rename: "ask",
          },
          commands: {
            build: "ask",
            test: "ask",
            controlledCommand: "ask",
          },
        },
      });
      expect(parsed.success).toBe(true);
    });

    it("Custom + missing matrix -> INVALID", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "custom",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(parsed.success).toBe(false);
    });

    it("invalid enum -> INVALID", () => {
      const parsed = schema.safeParse({
        projectId,
        trustLevel: "super-admin-trust",
        filePolicy: "allow-all", // invalid enum
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("2. Runner RPC Handler Execution", () => {
    it("unknown project -> NOT_FOUND", async () => {
      const handler = createProjectSetTrustPolicyHandler(registry);
      await expect(
        handler({
          projectId: "proj_non_existent",
          trustLevel: "standard",
          filePolicy: "ask",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        })
      );
    });

    it("Standard + Always Ask -> PASS and updates policy", async () => {
      const handler = createProjectSetTrustPolicyHandler(registry);
      const res = await handler({
        projectId,
        trustLevel: "standard",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(res.projectId).toBe(projectId);
      expect(res.policy.trustLevel).toBe("standard");
      expect(res.policy.filePolicy).toBe("ask");
      expect(res.policy.protectedFilesPolicy).toBe("always-ask");
    });

    it("Full Project Trust -> PASS and updates policy", async () => {
      const handler = createProjectSetTrustPolicyHandler(registry);
      const res = await handler({
        projectId,
        trustLevel: "full-project-trust",
        filePolicy: "allow",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
      expect(res.projectId).toBe(projectId);
      expect(res.policy.trustLevel).toBe("full-project-trust");
      expect(res.policy.filePolicy).toBe("allow");
    });
  });

  describe("3. Desktop Payload & Server-Runner Integration & Restart Simulation", () => {
    it("simulates SettingsPage selection -> payload -> Server Route -> Runner RPC -> DB persistence -> restart", async () => {
      const setHandler = createProjectSetTrustPolicyHandler(registry);
      const sessionHandler = createProjectSessionTrustHandler(registry);

      // --- Scenario A: Full Project Trust persists across restart ---
      // Frontend payload constructed by SettingsPage:
      const desktopPayloadA: ProjectTrustPolicy = {
        trustLevel: "full-project-trust",
        filePolicy: "allow",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      };

      // Server route execution simulation:
      const rpcResultA = await setHandler({
        projectId,
        trustLevel: desktopPayloadA.trustLevel,
        filePolicy: desktopPayloadA.filePolicy,
        commandPolicy: desktopPayloadA.commandPolicy,
        protectedFilesPolicy: desktopPayloadA.protectedFilesPolicy,
        customRules: desktopPayloadA.customRules,
      });
      // Server persists non-session policy to SQLite:
      projectService.setTrustPolicy(projectId, rpcResultA.policy);

      // Verify read-back state:
      const readBackA = projectService.getTrustPolicy(projectId);
      expect(readBackA?.trustLevel).toBe("full-project-trust");

      // Simulate Restart of Runner & Server:
      const newRegistry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
      const newPolicyA = newRegistry.getTrustPolicy(projectId);
      expect(newPolicyA.trustLevel).toBe("full-project-trust");

      // --- Scenario B: Session Trusted is in-memory only and expires on restart ---
      // Frontend payload constructed by SettingsPage:
      const desktopPayloadB: ProjectTrustPolicy = {
        trustLevel: "session-trusted",
        filePolicy: "allow",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      };

      // Server route execution simulation:
      const rpcResultB = await setHandler({
        projectId,
        trustLevel: desktopPayloadB.trustLevel,
        filePolicy: desktopPayloadB.filePolicy,
        commandPolicy: desktopPayloadB.commandPolicy,
        protectedFilesPolicy: desktopPayloadB.protectedFilesPolicy,
        customRules: desktopPayloadB.customRules,
      });

      // Runner returned active session-trusted policy:
      expect(rpcResultB.policy.trustLevel).toBe("session-trusted");
      expect(registry.isSessionTrusted(projectId)).toBe(true);

      // Server DOES NOT write 'session-trusted' to SQLite DB:
      if (rpcResultB.policy.trustLevel !== "session-trusted") {
        projectService.setTrustPolicy(projectId, rpcResultB.policy);
      } else {
        const currentDb = projectService.getTrustPolicy(projectId);
        if (currentDb) {
          projectService.setTrustPolicy(projectId, {
            ...currentDb,
            trustLevel: "standard",
            filePolicy: "ask",
          });
        }
      }

      // Read-back during session:
      // When Runner is asked for status:
      const sessionStatus = await sessionHandler({ projectId, action: "status" });
      expect(sessionStatus.active).toBe(true);
      const activePolicyDuringSession = registry.getTrustPolicy(projectId);
      expect(activePolicyDuringSession.trustLevel).toBe("session-trusted");

      // Simulate Restart (clean runner with empty in-memory grants):
      const restartedRegistry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
      expect(restartedRegistry.isSessionTrusted(projectId)).toBe(false);
      const policyAfterRestart = restartedRegistry.getTrustPolicy(projectId);
      // Session trust EXPIRED on restart:
      expect(policyAfterRestart.trustLevel).toBe("standard");

      // Database check after restart:
      const dbPolicyAfterRestart = projectService.getTrustPolicy(projectId);
      expect(dbPolicyAfterRestart?.trustLevel).toBe("standard");
    });
  });
});

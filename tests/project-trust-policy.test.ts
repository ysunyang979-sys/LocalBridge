import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ProjectTrustPolicy,
} from "@localbridge/protocol";
import { TrustPolicyEvaluator } from "@localbridge/security";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { ApprovalManager } from "../apps/runner/src/approvals/manager.js";
import { createFileDeleteHandler } from "../apps/runner/src/rpc/handlers/file-delete.js";
import { createFileCreateHandler } from "../apps/runner/src/rpc/handlers/file-create.js";
import { createFileWriteHandler } from "../apps/runner/src/rpc/handlers/file-write.js";
import { createFilePatchHandler } from "../apps/runner/src/rpc/handlers/file-patch.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("LocalBridge Trust & Approval Policy", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let approvalManager: ApprovalManager;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-trust-test-"));
    projectDir = path.join(tmpDir, "project");
    backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "trust-app" });
    registry.setAccessMode(proj.id, "read-write");
    projectId = proj.id;

    backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);
    approvalManager = new ApprovalManager();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("TrustPolicyEvaluator - 9-Step Evaluation Order & Invariants", () => {
    it("Step 1: Emergency Stop active denies everything regardless of trust level", () => {
      const res = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "temp.txt",
        projectEnabled: true,
        projectAccessMode: "read-write",
        isEmergencyStopped: true,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "allow",
          protectedFilesPolicy: "follow-policy",
        },
      });

      expect(res.decision).toBe("deny");
      expect(res.decisionSource).toBe("security-boundary");
      expect(res.requiresApproval).toBe(false);
    });

    it("Step 2: AI Paused active denies operation immediately", () => {
      const res = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "temp.txt",
        projectEnabled: true,
        projectAccessMode: "read-write",
        isAiPaused: true,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "allow",
          protectedFilesPolicy: "follow-policy",
        },
      });

      expect(res.decision).toBe("deny");
      expect(res.decisionSource).toBe("security-boundary");
    });

    it("Step 3: Token Scope intersection wins over Full Trust", () => {
      const res = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "temp.txt",
        projectEnabled: true,
        projectAccessMode: "read-write",
        tokenScopes: ["read"], // read-only token
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "allow",
          protectedFilesPolicy: "follow-policy",
        },
      });

      expect(res.decision).toBe("deny");
      expect(res.decisionSource).toBe("security-boundary");
      expect(res.reason).toContain("Token lacks required 'write' scope");
    });

    it("Step 4 & 5: Project disabled or read-only mode denies write operations", () => {
      const resDisabled = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "temp.txt",
        projectEnabled: false,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "allow",
          protectedFilesPolicy: "follow-policy",
        },
      });
      expect(resDisabled.decision).toBe("deny");

      const resReadOnly = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "temp.txt",
        projectEnabled: true,
        projectAccessMode: "read-only",
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "allow",
          protectedFilesPolicy: "follow-policy",
        },
      });
      expect(resReadOnly.decision).toBe("deny");
      expect(resReadOnly.reason).toContain("read-only mode");
    });

    it("Step 6: Protected Files Policy default always-ask wins even under Full Trust", () => {
      const protectedFiles = [
        ".env",
        ".env.local",
        "id_rsa",
        "id_rsa.pub",
        "server.key",
        "cert.pem",
        "credentials.json",
      ];

      for (const pFile of protectedFiles) {
        const res = TrustPolicyEvaluator.evaluate({
          projectId,
          operation: "file.delete",
          relativePath: pFile,
          projectEnabled: true,
          projectAccessMode: "read-write",
          trustPolicy: {
            trustLevel: "full-project-trust",
            filePolicy: "allow-all",
            commandPolicy: "allow",
            protectedFilesPolicy: "always-ask",
          },
        });

        expect(res.decision).toBe("ask");
        expect(res.decisionSource).toBe("protected-file");
        expect(res.requiresApproval).toBe(true);
      }
    });

    it("Absolute Security Boundary (.git, .localbridge) always denies access regardless of trust policy", () => {
      const boundaryPaths = [".git/config", ".git/HEAD", ".localbridge/state.json", "localbridge.json"];
      for (const bPath of boundaryPaths) {
        const res = TrustPolicyEvaluator.evaluate({
          projectId,
          operation: "file.delete",
          relativePath: bPath,
          projectEnabled: true,
          projectAccessMode: "read-write",
          trustPolicy: {
            trustLevel: "full-project-trust",
            filePolicy: "allow-all",
            commandPolicy: "allow",
            protectedFilesPolicy: "follow-policy",
          },
          isSessionTrusted: true,
        });

        expect(res.decision).toBe("deny");
        expect(res.decisionSource).toBe("security-boundary");
        expect(res.requiresApproval).toBe(false);
      }
    });

    it("Protected Files Policy with 'deny' blocks access completely", () => {
      const res = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: ".env",
        projectEnabled: true,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "allow",
          protectedFilesPolicy: "deny",
        },
      });

      expect(res.decision).toBe("deny");
      expect(res.decisionSource).toBe("protected-file");
    });

    it("Full Project Trust auto-allows normal files but keeps command execution isolated", () => {
      // Normal file delete -> Auto Allow
      const fileRes = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "src/utils.ts",
        projectEnabled: true,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask", // isolated
          protectedFilesPolicy: "always-ask",
        },
      });
      expect(fileRes.decision).toBe("allow");
      expect(fileRes.decisionSource).toBe("project-policy");
      expect(fileRes.requiresApproval).toBe(false);

      // Command run under Full Trust still requires approval by default!
      const cmdRes = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "command.run",
        projectEnabled: true,
        projectAccessMode: "read-write",
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });
      expect(cmdRes.decision).toBe("ask");
      expect(cmdRes.decisionSource).toBe("project-policy");
      expect(cmdRes.requiresApproval).toBe(true);
    });

    it("Session Trust auto-allows normal files in-memory", () => {
      const res = TrustPolicyEvaluator.evaluate({
        projectId,
        operation: "file.delete",
        relativePath: "temp.txt",
        projectEnabled: true,
        projectAccessMode: "read-write",
        isSessionTrusted: true,
      });

      expect(res.decision).toBe("allow");
      expect(res.decisionSource).toBe("session-trust");
      expect(res.policyLevel).toBe("session-trusted");
    });
  });

  describe("Runner RPC file.delete with Trust Policy Integration", () => {
    it("under Standard policy: delete without approval throws APPROVAL_REQUIRED", async () => {
      const handler = createFileDeleteHandler(fsService, approvalManager, registry);
      fs.writeFileSync(path.join(projectDir, "test.txt"), "hello", "utf-8");
      const hash = computeSha256("hello");

      await expect(
        handler({
          projectId,
          path: "test.txt",
          expectedHash: hash,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
        })
      );

      // Verify approval was created in approvalManager
      const pending = approvalManager.list({ projectId, status: "pending" });
      expect(pending.length).toBe(1);
      expect(pending[0]!.operation).toBe("file.delete");
    });

    it("under Full Project Trust: delete normal file succeeds directly without creating approval records", async () => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });

      const handler = createFileDeleteHandler(fsService, approvalManager, registry);
      fs.writeFileSync(path.join(projectDir, "app.ts"), "const x = 1;", "utf-8");
      const hash = computeSha256("const x = 1;");

      const result = await handler({
        projectId,
        path: "app.ts",
        expectedHash: hash,
      });

      expect(result.deleted).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "app.ts"))).toBe(false);

      // Verify NO approvals were created
      const approvals = approvalManager.list({ projectId });
      expect(approvals.length).toBe(0);
    });

    it("under Full Project Trust: consecutive file deletes all succeed without approvals", async () => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });

      const handler = createFileDeleteHandler(fsService, approvalManager, registry);

      for (let i = 1; i <= 3; i++) {
        const fileName = `file_${i}.txt`;
        fs.writeFileSync(path.join(projectDir, fileName), `content ${i}`, "utf-8");
        const hash = computeSha256(`content ${i}`);

        const result = await handler({
          projectId,
          path: fileName,
          expectedHash: hash,
        });

        expect(result.deleted).toBe(true);
        expect(fs.existsSync(path.join(projectDir, fileName))).toBe(false);
      }

      // Zero approvals created
      expect(approvalManager.list({ projectId }).length).toBe(0);
    });

    it("under Full Project Trust: protected file .env STILL requires approval", async () => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });

      const handler = createFileDeleteHandler(fsService, approvalManager, registry);
      fs.writeFileSync(path.join(projectDir, ".env"), "SECRET=123", "utf-8");
      const hash = computeSha256("SECRET=123");

      await expect(
        handler({
          projectId,
          path: ".env",
          expectedHash: hash,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
        })
      );
    });

    it("under Session Trust: delete succeeds directly", async () => {
      registry.grantSessionTrust(projectId);
      expect(registry.isSessionTrusted(projectId)).toBe(true);

      const handler = createFileDeleteHandler(fsService, approvalManager, registry);
      fs.writeFileSync(path.join(projectDir, "temp.log"), "log line", "utf-8");
      const hash = computeSha256("log line");

      const result = await handler({
        projectId,
        path: "temp.log",
        expectedHash: hash,
      });

      expect(result.deleted).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "temp.log"))).toBe(false);

      // Revoking session trust restores requirement
      registry.revokeSessionTrust(projectId);
      expect(registry.isSessionTrusted(projectId)).toBe(false);

      fs.writeFileSync(path.join(projectDir, "temp2.log"), "log line 2", "utf-8");
      const hash2 = computeSha256("log line 2");

      await expect(
        handler({
          projectId,
          path: "temp2.log",
          expectedHash: hash2,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
        })
      );
    });

    it("under Full Project Trust: file.create, file.write, file.patch normal files succeed directly without approvals", async () => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });

      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      const writeHandler = createFileWriteHandler(fsService, approvalManager, registry);
      const patchHandler = createFilePatchHandler(fsService, approvalManager, registry);

      // 1. Create file directly
      const createRes = await createHandler({
        projectId,
        path: "trust-test-a.txt",
        content: "A",
      });
      expect(createRes.path).toBe("trust-test-a.txt");
      expect(fs.readFileSync(path.join(projectDir, "trust-test-a.txt"), "utf-8")).toBe("A");

      // 2. Write file directly
      const writeRes = await writeHandler({
        projectId,
        path: "trust-test-a.txt",
        expectedHash: createRes.newHash,
        content: "B",
      });
      expect(writeRes.newHash).toBeDefined();
      expect(fs.readFileSync(path.join(projectDir, "trust-test-a.txt"), "utf-8")).toBe("B");

      // 3. Patch file directly
      const patchRes = await patchHandler({
        projectId,
        path: "trust-test-a.txt",
        expectedHash: writeRes.newHash,
        replacements: [{ search: "B", replace: "B\nC" }],
      });
      expect(patchRes.replacementsApplied).toBe(1);
      expect(fs.readFileSync(path.join(projectDir, "trust-test-a.txt"), "utf-8")).toBe("B\nC");

      // Zero approvals created
      expect(approvalManager.list({ projectId }).length).toBe(0);
    });

    it("under Full Project Trust: protected file write/patch requires approval when protectedFilesPolicy is always-ask", async () => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });

      const writeHandler = createFileWriteHandler(fsService, approvalManager, registry);
      fs.writeFileSync(path.join(projectDir, ".env.test-policy"), "KEY=OLD", "utf-8");
      const hash = computeSha256("KEY=OLD");

      await expect(
        writeHandler({
          projectId,
          path: ".env.test-policy",
          expectedHash: hash,
          content: "KEY=NEW",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.APPROVAL_REQUIRED,
        })
      );
    });
  });

  describe("ProjectRegistry Invariants & Lifecycle", () => {
    it("persists trustPolicy to disk and reloads on new registry instance", () => {
      const policy: ProjectTrustPolicy = {
        trustLevel: "full-project-trust",
        filePolicy: "allow-all",
        commandPolicy: "controlled",
        protectedFilesPolicy: "deny",
      };

      registry.setTrustPolicy({ projectId, trustPolicy: policy });

      const loadedPolicy = registry.getTrustPolicy(projectId);
      expect(loadedPolicy).toBeDefined();
      expect(loadedPolicy?.trustLevel).toBe("full-project-trust");
      expect(loadedPolicy?.commandPolicy).toBe("controlled");
      expect(loadedPolicy?.protectedFilesPolicy).toBe("deny");

      // Reload from disk
      const newRegistry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
      const reloaded = newRegistry.getTrustPolicy(projectId);
      expect(reloaded?.trustLevel).toBe("full-project-trust");
      expect(reloaded?.protectedFilesPolicy).toBe("deny");
    });

    it("session trust is in-memory only and never persisted to disk", () => {
      registry.grantSessionTrust(projectId);
      expect(registry.isSessionTrusted(projectId)).toBe(true);

      // New registry instance (simulating daemon restart) has no session trust
      const freshRegistry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
      expect(freshRegistry.isSessionTrusted(projectId)).toBe(false);
    });

    it("changing project root automatically invalidates trust policy back to standard", () => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });
      expect(registry.getTrustPolicy(projectId)?.trustLevel).toBe("full-project-trust");

      const newDir = path.join(tmpDir, "new-root");
      fs.mkdirSync(newDir, { recursive: true });

      // Simulate root modification in persistent state
      const statePath = path.join(tmpDir, "projects.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.projects[0].canonicalRoot = newDir;
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      // Reload from disk
      registry.reload();

      // Invalidation check: trust policy should be reset to standard
      const policyAfter = registry.getTrustPolicy(projectId);
      expect(policyAfter?.trustLevel).toBe("standard");
    });
  });

  describe("ApprovalManager.bulkResolve", () => {
    it("bulk resolves multiple approvals with detailed results", () => {
      const app1 = approvalManager.create({
        projectId,
        operation: "file.delete",
        risk: "DANGEROUS",
        summary: "delete 1",
        payloadHash: "hash1",
      });

      const app2 = approvalManager.create({
        projectId,
        operation: "file.delete",
        risk: "DANGEROUS",
        summary: "delete 2",
        payloadHash: "hash2",
      });

      const bulkRes = approvalManager.bulkResolve({
        approvalIds: [app1.id, app2.id, "approval_nonexistent"],
        action: "approve",
        resolvedBy: "test-operator",
      });

      expect(bulkRes.resolvedCount).toBe(2);
      expect(bulkRes.failedCount).toBe(1);
      expect(bulkRes.results.length).toBe(3);

      expect(approvalManager.get(app1.id)?.status).toBe("approved");
      expect(approvalManager.get(app2.id)?.status).toBe("approved");
    });
  });
});

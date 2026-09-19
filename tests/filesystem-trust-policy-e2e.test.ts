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
import { createFileCreateHandler } from "../apps/runner/src/rpc/handlers/file-create.js";
import { createFileWriteHandler } from "../apps/runner/src/rpc/handlers/file-write.js";
import { createFilePatchHandler } from "../apps/runner/src/rpc/handlers/file-patch.js";
import { createFileDeleteHandler } from "../apps/runner/src/rpc/handlers/file-delete.js";
import { createFileReadHandler } from "../apps/runner/src/rpc/handlers/file-read.js";
import { createFileStatHandler } from "../apps/runner/src/rpc/handlers/file-stat.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("Filesystem E2E Trust Policy Regression Tests", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let approvalManager: ApprovalManager;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-e2e-"));
    projectDir = path.join(tmpDir, "project");
    backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "test-app" });
    registry.setAccessMode(proj.id, "read-write");
    projectId = proj.id;

    backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);
    approvalManager = new ApprovalManager();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Real Production Scenario: Full Project Trust + Follow Policy (Expert Mode)", () => {
    beforeEach(() => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "follow-policy",
        },
      });
    });

    it("creates .env.localbridge-test without being hard-denied by path resolver or policy", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      const content = "TEST_ONLY=true\nFAKE_SECRET=not-a-real-secret\n";

      const res = await createHandler({
        projectId,
        path: ".env.localbridge-test",
        content,
      });

      expect(res.path).toBe(".env.localbridge-test");
      expect(fs.readFileSync(path.join(projectDir, ".env.localbridge-test"), "utf-8")).toBe(content);
      expect(approvalManager.list({ projectId }).length).toBe(0);
    });

    it("writes, patches, and deletes .env.localbridge-test directly without approvals", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      const writeHandler = createFileWriteHandler(fsService, approvalManager, registry);
      const patchHandler = createFilePatchHandler(fsService, approvalManager, registry);
      const deleteHandler = createFileDeleteHandler(fsService, approvalManager, registry);

      // 1. Create
      const cRes = await createHandler({
        projectId,
        path: ".env.localbridge-test",
        content: "INITIAL=1\n",
      });
      expect(cRes.newHash).toBeDefined();

      // 2. Write
      const wRes = await writeHandler({
        projectId,
        path: ".env.localbridge-test",
        expectedHash: cRes.newHash,
        content: "UPDATED=2\n",
      });
      expect(wRes.newHash).toBeDefined();

      // 3. Patch
      const pRes = await patchHandler({
        projectId,
        path: ".env.localbridge-test",
        expectedHash: wRes.newHash,
        replacements: [{ search: "UPDATED=2", replace: "UPDATED=3" }],
      });
      expect(pRes.replacementsApplied).toBe(1);

      // 4. Delete
      const dRes = await deleteHandler({
        projectId,
        path: ".env.localbridge-test",
        expectedHash: pRes.newHash,
      });
      expect(dRes.deleted).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".env.localbridge-test"))).toBe(false);

      // No approvals ever created
      expect(approvalManager.list({ projectId }).length).toBe(0);
    });

    it("normal .txt file is auto-allowed", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      const res = await createHandler({
        projectId,
        path: "normal.txt",
        content: "just text",
      });
      expect(res.path).toBe("normal.txt");
      expect(fs.existsSync(path.join(projectDir, "normal.txt"))).toBe(true);
    });
  });

  describe("Full Project Trust + Always Ask (Default Safe Mode for Protected Files)", () => {
    beforeEach(() => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
        },
      });
    });

    it("normal file is auto-allowed while .env.localbridge-test triggers approval flow", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);

      // Normal file auto-allowed
      await createHandler({
        projectId,
        path: "hello.txt",
        content: "world",
      });
      expect(fs.existsSync(path.join(projectDir, "hello.txt"))).toBe(true);

      // Protected file requires approval
      let err: any;
      try {
        await createHandler({
          projectId,
          path: ".env.localbridge-test",
          content: "KEY=VAL",
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeInstanceOf(LocalBridgeError);
      expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      expect(err.details?.approvalId).toBeDefined();
      expect(err.details?.approvalId).toMatch(/^approval_/);

      const approvalId = err.details!.approvalId as string;

      // Operator approves
      approvalManager.resolve({ approvalId, action: "approve", resolvedBy: "operator-alice" });

      // Retry with approvalId succeeds
      const retryRes = await createHandler({
        projectId,
        path: ".env.localbridge-test",
        content: "KEY=VAL",
        approvalId,
      });
      expect(retryRes.path).toBe(".env.localbridge-test");
      expect(fs.existsSync(path.join(projectDir, ".env.localbridge-test"))).toBe(true);

      // Replay with consumed approvalId fails
      await expect(
        createHandler({
          projectId,
          path: ".env.localbridge-test",
          content: "KEY=VAL",
          approvalId,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        })
      );
    });

    it("file.create and file.write on *.key trigger approval flow and succeed upon approval", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      const writeHandler = createFileWriteHandler(fsService, approvalManager, registry);

      // Create *.key requires approval
      let createErr: any;
      try {
        await createHandler({
          projectId,
          path: "server.key",
          content: "-----BEGIN PRIVATE KEY-----\n",
        });
      } catch (e) {
        createErr = e;
      }
      expect(createErr.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      const createAppId = createErr.details!.approvalId as string;

      approvalManager.resolve({ approvalId: createAppId, action: "approve", resolvedBy: "operator-bob" });
      const createRes = await createHandler({
        projectId,
        path: "server.key",
        content: "-----BEGIN PRIVATE KEY-----\n",
        approvalId: createAppId,
      });
      expect(createRes.path).toBe("server.key");

      // Write *.key requires approval
      let writeErr: any;
      try {
        await writeHandler({
          projectId,
          path: "server.key",
          expectedHash: createRes.newHash,
          content: "-----BEGIN RSA PRIVATE KEY-----\n",
        });
      } catch (e) {
        writeErr = e;
      }
      expect(writeErr.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      const writeAppId = writeErr.details!.approvalId as string;

      approvalManager.resolve({ approvalId: writeAppId, action: "approve", resolvedBy: "operator-bob" });
      const writeRes = await writeHandler({
        projectId,
        path: "server.key",
        expectedHash: createRes.newHash,
        content: "-----BEGIN RSA PRIVATE KEY-----\n",
        approvalId: writeAppId,
      });
      expect(writeRes.path).toBe("server.key");
    });
  });

  describe("Absolute Security Boundaries (Defense-in-Depth - CANNOT be bypassed)", () => {
    beforeEach(() => {
      registry.setTrustPolicy({
        projectId,
        trustPolicy: {
          trustLevel: "full-project-trust",
          filePolicy: "allow-all",
          commandPolicy: "controlled",
          protectedFilesPolicy: "follow-policy",
        },
      });
      registry.grantSessionTrust(projectId);
    });

    it("access to .git/* is strictly DENIED even under Full Trust + Follow Policy + Session Trust", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      const readHandler = createFileReadHandler(fsService, approvalManager, registry);

      // Create .git/evil
      await expect(
        createHandler({
          projectId,
          path: ".git/evil",
          content: "malicious",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.POLICY_DENIED,
        })
      );

      // Read .git/config
      fs.mkdirSync(path.join(projectDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(projectDir, ".git", "config"), "[core]", "utf-8");

      await expect(
        readHandler({
          projectId,
          path: ".git/config",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.PATH_NOT_ALLOWED,
        })
      );
    });

    it("access to .localbridge/* is strictly DENIED", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      await expect(
        createHandler({
          projectId,
          path: ".localbridge/secret.json",
          content: "secret",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.POLICY_DENIED,
        })
      );
    });

    it("access to localbridge.json is strictly DENIED", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      await expect(
        createHandler({
          projectId,
          path: "localbridge.json",
          content: "{}",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.POLICY_DENIED,
        })
      );
    });

    it("path traversal is strictly DENIED by security sandbox", async () => {
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);
      await expect(
        createHandler({
          projectId,
          path: "../escaped.txt",
          content: "outside",
        })
      ).rejects.toThrowError();
    });

    it("read-only project mode cannot be bypassed by Full Trust or Follow Policy", async () => {
      registry.setAccessMode(projectId, "read-only");
      const createHandler = createFileCreateHandler(fsService, approvalManager, registry);

      await expect(
        createHandler({
          projectId,
          path: "test.txt",
          content: "should fail",
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
        })
      );
    });
  });
});

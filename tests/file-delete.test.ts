import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("file.delete Operation & Quarantine Backup", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-delete-test-"));
    projectDir = path.join(tmpDir, "project");
    backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "test-app" });
    registry.setAccessMode(proj.id, "read-write");
    projectId = proj.id;

    backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("safely deletes existing file with matching expectedHash and stores quarantine backup", async () => {
    const text = "To be deleted securely";
    fs.writeFileSync(path.join(projectDir, "target.txt"), text, "utf-8");
    const hash = computeSha256(text);

    const result = await fsService.deleteFile({
      projectId,
      path: "target.txt",
      expectedHash: hash,
    });

    expect(result.projectId).toBe(projectId);
    expect(result.path).toBe("target.txt");
    expect(result.oldHash).toBe(hash);
    expect(result.deleted).toBe(true);
    expect(result.backupCreated).toBe(true);
    expect(result.operationId).toMatch(/^op_/);

    // Verify file unlinked
    expect(fs.existsSync(path.join(projectDir, "target.txt"))).toBe(false);

    // Verify quarantine backup
    const backupEntry = backupService.getBackup(projectId, result.operationId);
    expect(backupEntry.metadata.operation).toBe("delete");
    expect(backupEntry.metadata.oldHash).toBe(hash);
    expect(backupEntry.content.toString("utf-8")).toBe(text);
  });

  it("rejects deletion when expectedHash mismatches current file (FILE_CONFLICT)", async () => {
    fs.writeFileSync(path.join(projectDir, "keep.txt"), "Important data", "utf-8");

    await expect(
      fsService.deleteFile({
        projectId,
        path: "keep.txt",
        expectedHash: "sha256:wronghash",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_CONFLICT,
      })
    );

    // Verify file was not deleted
    expect(fs.existsSync(path.join(projectDir, "keep.txt"))).toBe(true);
  });

  it("rejects deletion if file does not exist (FILE_NOT_FOUND)", async () => {
    await expect(
      fsService.deleteFile({
        projectId,
        path: "non-existent.txt",
        expectedHash: "sha256:dummy",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_NOT_FOUND,
      })
    );
  });

  it("rejects deletion if target is a directory (FILE_NOT_REGULAR)", async () => {
    fs.mkdirSync(path.join(projectDir, "folder"));

    await expect(
      fsService.deleteFile({
        projectId,
        path: "folder",
        expectedHash: "sha256:dummy",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_NOT_REGULAR,
      })
    );
  });
});

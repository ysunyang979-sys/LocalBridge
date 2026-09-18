import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("file.restore Operation & Recovery Safety", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-restore-test-"));
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

  it("restores file state after a file.write operation", async () => {
    const originalText = "Original initial content";
    fs.writeFileSync(path.join(projectDir, "file.txt"), originalText, "utf-8");
    const originalHash = computeSha256(originalText);

    const writeResult = await fsService.writeFile({
      projectId,
      path: "file.txt",
      expectedHash: originalHash,
      content: "Modified new content",
    });

    // Execute restore
    const restoreResult = await fsService.restoreFile({
      projectId,
      operationId: writeResult.operationId,
    });

    expect(restoreResult.projectId).toBe(projectId);
    expect(restoreResult.path).toBe("file.txt");
    expect(restoreResult.restoredHash).toBe(originalHash);
    expect(restoreResult.bytesRestored).toBe(Buffer.byteLength(originalText, "utf-8"));

    // Verify on disk
    const onDisk = fs.readFileSync(path.join(projectDir, "file.txt"), "utf-8");
    expect(onDisk).toBe(originalText);
  });

  it("restores file state after a file.delete operation (quarantine recovery)", async () => {
    const text = "Quarantined file to be recovered";
    fs.writeFileSync(path.join(projectDir, "important.txt"), text, "utf-8");
    const hash = computeSha256(text);

    const deleteResult = await fsService.deleteFile({
      projectId,
      path: "important.txt",
      expectedHash: hash,
    });

    expect(fs.existsSync(path.join(projectDir, "important.txt"))).toBe(false);

    // Execute restore
    const restoreResult = await fsService.restoreFile({
      projectId,
      operationId: deleteResult.operationId,
    });

    expect(restoreResult.path).toBe("important.txt");
    expect(restoreResult.restoredHash).toBe(hash);

    // Verify file is back on disk
    const restoredText = fs.readFileSync(path.join(projectDir, "important.txt"), "utf-8");
    expect(restoredText).toBe(text);
  });

  it("rejects restore if backup operationId is not found (BACKUP_NOT_FOUND)", async () => {
    await expect(
      fsService.restoreFile({
        projectId,
        operationId: "op_non_existent",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.BACKUP_NOT_FOUND,
      })
    );
  });

  it("rejects restore if file was modified after the operation (RESTORE_CONFLICT)", async () => {
    const originalText = "Original content";
    fs.writeFileSync(path.join(projectDir, "doc.txt"), originalText, "utf-8");
    const originalHash = computeSha256(originalText);

    const writeResult = await fsService.writeFile({
      projectId,
      path: "doc.txt",
      expectedHash: originalHash,
      content: "First write",
    });

    // Simulate an external concurrent modification
    fs.writeFileSync(path.join(projectDir, "doc.txt"), "Concurrent external modification", "utf-8");

    // Attempt to restore first write
    await expect(
      fsService.restoreFile({
        projectId,
        operationId: writeResult.operationId,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.RESTORE_CONFLICT,
      })
    );
  });
});

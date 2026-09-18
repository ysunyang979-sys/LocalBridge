import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("file.write Operation, Conflict Detection & Backup", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-write-test-"));
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

  it("successfully overwrites an existing file with matching expectedHash and creates backup", async () => {
    const initialText = "Original version 1";
    fs.writeFileSync(path.join(projectDir, "app.ts"), initialText, "utf-8");
    const initialHash = computeSha256(initialText);

    const updatedText = "Updated version 2 with more lines";
    const result = await fsService.writeFile({
      projectId,
      path: "app.ts",
      expectedHash: initialHash,
      content: updatedText,
    });

    expect(result.projectId).toBe(projectId);
    expect(result.path).toBe("app.ts");
    expect(result.oldHash).toBe(initialHash);
    expect(result.newHash).toBe(computeSha256(updatedText));
    expect(result.bytesBefore).toBe(Buffer.byteLength(initialText, "utf-8"));
    expect(result.bytesAfter).toBe(Buffer.byteLength(updatedText, "utf-8"));
    expect(result.backupCreated).toBe(true);
    expect(result.operationId).toMatch(/^op_/);

    // Verify on-disk file content
    const diskContent = fs.readFileSync(path.join(projectDir, "app.ts"), "utf-8");
    expect(diskContent).toBe(updatedText);

    // Verify backup existence in backup storage
    const backupEntry = backupService.getBackup(projectId, result.operationId);
    expect(backupEntry.metadata.oldHash).toBe(initialHash);
    expect(backupEntry.metadata.newHash).toBe(result.newHash);
    expect(backupEntry.metadata.operation).toBe("write");
    expect(backupEntry.content.toString("utf-8")).toBe(initialText);
  });

  it("rejects overwrite when expectedHash does not match current file hash (FILE_CONFLICT)", async () => {
    fs.writeFileSync(path.join(projectDir, "app.ts"), "Current text on disk", "utf-8");

    await expect(
      fsService.writeFile({
        projectId,
        path: "app.ts",
        expectedHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        content: "New text",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_CONFLICT,
      })
    );
  });

  it("rejects overwrite if file does not exist (FILE_NOT_FOUND)", async () => {
    await expect(
      fsService.writeFile({
        projectId,
        path: "missing.ts",
        expectedHash: "sha256:dummy",
        content: "content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_NOT_FOUND,
      })
    );
  });

  it("rejects overwrite if target is a directory (FILE_NOT_REGULAR)", async () => {
    fs.mkdirSync(path.join(projectDir, "subdir"));

    await expect(
      fsService.writeFile({
        projectId,
        path: "subdir",
        expectedHash: "sha256:dummy",
        content: "content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_NOT_REGULAR,
      })
    );
  });

  it("rejects write with binary content containing NUL bytes (BINARY_FILE)", async () => {
    fs.writeFileSync(path.join(projectDir, "file.txt"), "Hello", "utf-8");
    const hash = computeSha256("Hello");

    await expect(
      fsService.writeFile({
        projectId,
        path: "file.txt",
        expectedHash: hash,
        content: "Hello\0Binary",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.BINARY_FILE,
      })
    );
  });

  it("rejects write if target is a symlink (FILE_SYMLINK_WRITE_BLOCKED)", async () => {
    const realFile = path.join(tmpDir, "external.txt");
    fs.writeFileSync(realFile, "external content");
    const linkPath = path.join(projectDir, "symlink.txt");

    try {
      fs.symlinkSync(realFile, linkPath);
    } catch {
      // If symlinks not permitted on current Windows environment, skip
      return;
    }

    await expect(
      fsService.writeFile({
        projectId,
        path: "symlink.txt",
        expectedHash: computeSha256("external content"),
        content: "new content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: expect.stringMatching(/FILE_SYMLINK_WRITE_BLOCKED|PATH_SYMLINK_ESCAPE/),
      })
    );
  });
});

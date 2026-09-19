import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";

describe("file.create Operation & Sandbox Validation", () => {
  let tmpDir: string;
  let projectDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-create-test-"));
    projectDir = path.join(tmpDir, "project");
    const backupDir = path.join(tmpDir, "backups");
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

  it("successfully creates a new UTF-8 text file in the project root", async () => {
    const result = await fsService.createFile({
      projectId,
      path: "hello.txt",
      content: "Hello LocalBridge Phase 6!",
    });

    expect(result.projectId).toBe(projectId);
    expect(result.path).toBe("hello.txt");
    expect(result.bytes).toBe(Buffer.byteLength("Hello LocalBridge Phase 6!", "utf-8"));
    expect(result.newHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.operationId).toMatch(/^op_/);

    const onDisk = fs.readFileSync(path.join(projectDir, "hello.txt"), "utf-8");
    expect(onDisk).toBe("Hello LocalBridge Phase 6!");
  });

  it("successfully creates a file inside an existing subfolder", async () => {
    fs.mkdirSync(path.join(projectDir, "src", "components"), { recursive: true });

    const result = await fsService.createFile({
      projectId,
      path: "src/components/Button.tsx",
      content: "export const Button = () => <button />;",
    });

    expect(result.path).toBe("src/components/Button.tsx");
    expect(fs.existsSync(path.join(projectDir, "src", "components", "Button.tsx"))).toBe(true);
  });

  it("rejects creation if target file already exists (FILE_ALREADY_EXISTS)", async () => {
    fs.writeFileSync(path.join(projectDir, "existing.txt"), "Already here");

    await expect(
      fsService.createFile({
        projectId,
        path: "existing.txt",
        content: "New content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_ALREADY_EXISTS,
      })
    );
  });

  it("rejects creation if direct parent directory does not exist (PARENT_DIRECTORY_NOT_FOUND)", async () => {
    await expect(
      fsService.createFile({
        projectId,
        path: "non/existent/deep/dir/file.txt",
        content: "content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PARENT_DIRECTORY_NOT_FOUND,
      })
    );
  });

  it("rejects creation if path contains directory traversal (PATH_TRAVERSAL)", async () => {
    await expect(
      fsService.createFile({
        projectId,
        path: "../outside.txt",
        content: "content",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PATH_TRAVERSAL,
      })
    );
  });

  it("rejects creation targeting absolute deny paths (PATH_NOT_ALLOWED)", async () => {
    await expect(
      fsService.createFile({
        projectId,
        path: ".git/config",
        content: "SECRET=123",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PATH_NOT_ALLOWED,
      })
    );
  });

  it("rejects creation with binary content containing NUL bytes (BINARY_FILE)", async () => {
    await expect(
      fsService.createFile({
        projectId,
        path: "binary.bin",
        content: "Text\0Binary",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.BINARY_FILE,
      })
    );
  });

  it("rejects creation exceeding 8 MiB file size limit (FILE_TOO_LARGE)", async () => {
    const hugeContent = "x".repeat(8 * 1024 * 1024 + 1);

    await expect(
      fsService.createFile({
        projectId,
        path: "huge.txt",
        content: hugeContent,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_TOO_LARGE,
      })
    );
  });
});

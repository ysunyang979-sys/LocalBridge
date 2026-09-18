import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";

describe("Project Access Mode & Authorization Boundary", () => {
  let tmpDir: string;
  let storageFile: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-access-test-"));
    storageFile = path.join(tmpDir, "projects.json");
    projectDir = path.join(tmpDir, "my-project");
    backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(storageFile);
    backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults newly added projects to read-only accessMode", () => {
    const proj = registry.add(projectDir, { name: "test-app" });
    expect(proj.accessMode).toBe("read-only");

    const publicList = registry.listPublic();
    expect(publicList[0]?.accessMode).toBe("read-only");

    const publicInfo = registry.infoPublic(proj.id);
    expect(publicInfo?.accessMode).toBe("read-only");
  });

  it("updates access mode locally via setAccessMode and persists to disk", () => {
    const proj = registry.add(projectDir, { name: "test-app" });
    expect(proj.accessMode).toBe("read-only");

    const updated = registry.setAccessMode(proj.id, "read-write");
    expect(updated.accessMode).toBe("read-write");

    // Check persistence across new registry instance
    const freshRegistry = new ProjectRegistry(storageFile);
    const reloaded = freshRegistry.get(proj.id);
    expect(reloaded?.accessMode).toBe("read-write");
  });

  it("rejects file.create when project is in read-only mode", async () => {
    const proj = registry.add(projectDir, { name: "test-app" });
    expect(proj.accessMode).toBe("read-only");

    await expect(
      fsService.createFile({
        projectId: proj.id,
        path: "hello.txt",
        content: "Hello World",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
      })
    );
  });

  it("rejects file.write when project is in read-only mode", async () => {
    const proj = registry.add(projectDir, { name: "test-app" });
    fs.writeFileSync(path.join(projectDir, "test.txt"), "Initial");

    await expect(
      fsService.writeFile({
        projectId: proj.id,
        path: "test.txt",
        expectedHash: "sha256:dummy",
        content: "Updated",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
      })
    );
  });

  it("rejects file.patch when project is in read-only mode", async () => {
    const proj = registry.add(projectDir, { name: "test-app" });
    fs.writeFileSync(path.join(projectDir, "test.txt"), "Initial");

    await expect(
      fsService.patchFile({
        projectId: proj.id,
        path: "test.txt",
        expectedHash: "sha256:dummy",
        replacements: [{ search: "Initial", replace: "Updated" }],
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
      })
    );
  });

  it("rejects file.delete when project is in read-only mode", async () => {
    const proj = registry.add(projectDir, { name: "test-app" });
    fs.writeFileSync(path.join(projectDir, "test.txt"), "Initial");

    await expect(
      fsService.deleteFile({
        projectId: proj.id,
        path: "test.txt",
        expectedHash: "sha256:dummy",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
      })
    );
  });

  it("rejects file.restore when project is in read-only mode", async () => {
    const proj = registry.add(projectDir, { name: "test-app" });

    await expect(
      fsService.restoreFile({
        projectId: proj.id,
        operationId: "op_dummy",
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROJECT_READ_ONLY,
      })
    );
  });
});

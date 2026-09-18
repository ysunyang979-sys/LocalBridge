import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("file.patch Operation & Sequential In-Memory Engine", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-patch-test-"));
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

  it("successfully applies multiple sequential replacements with matching expectedHash", async () => {
    const originalText = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
    fs.writeFileSync(path.join(projectDir, "math.ts"), originalText, "utf-8");
    const originalHash = computeSha256(originalText);

    const result = await fsService.patchFile({
      projectId,
      path: "math.ts",
      expectedHash: originalHash,
      replacements: [
        { search: "const a = 1;", replace: "const a = 100;" },
        { search: "const c = 3;", replace: "const c = 300;" },
      ],
    });

    expect(result.projectId).toBe(projectId);
    expect(result.path).toBe("math.ts");
    expect(result.oldHash).toBe(originalHash);
    expect(result.replacementsApplied).toBe(2);

    const updatedText = "const a = 100;\nconst b = 2;\nconst c = 300;\n";
    expect(result.newHash).toBe(computeSha256(updatedText));

    // Verify on disk
    const diskContent = fs.readFileSync(path.join(projectDir, "math.ts"), "utf-8");
    expect(diskContent).toBe(updatedText);

    // Verify backup created
    const backupEntry = backupService.getBackup(projectId, result.operationId);
    expect(backupEntry.metadata.operation).toBe("patch");
    expect(backupEntry.content.toString("utf-8")).toBe(originalText);
  });

  it("rejects patch if search pattern is not found (PATCH_NOT_FOUND)", async () => {
    const originalText = "hello world\n";
    fs.writeFileSync(path.join(projectDir, "hello.txt"), originalText, "utf-8");
    const originalHash = computeSha256(originalText);

    await expect(
      fsService.patchFile({
        projectId,
        path: "hello.txt",
        expectedHash: originalHash,
        replacements: [
          { search: "not matching anything", replace: "something" },
        ],
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PATCH_NOT_FOUND,
      })
    );

    // Verify file content is unchanged (rollback/no modification)
    const diskContent = fs.readFileSync(path.join(projectDir, "hello.txt"), "utf-8");
    expect(diskContent).toBe(originalText);
  });

  it("rejects patch if search pattern matches multiple times (PATCH_AMBIGUOUS)", async () => {
    const originalText = "foo\nbar\nfoo\n";
    fs.writeFileSync(path.join(projectDir, "ambiguous.txt"), originalText, "utf-8");
    const originalHash = computeSha256(originalText);

    await expect(
      fsService.patchFile({
        projectId,
        path: "ambiguous.txt",
        expectedHash: originalHash,
        replacements: [
          { search: "foo", replace: "baz" },
        ],
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PATCH_AMBIGUOUS,
      })
    );

    // File remains unchanged
    const diskContent = fs.readFileSync(path.join(projectDir, "ambiguous.txt"), "utf-8");
    expect(diskContent).toBe(originalText);
  });

  it("rejects patch if expectedHash does not match current file (FILE_CONFLICT)", async () => {
    const originalText = "version 1\n";
    fs.writeFileSync(path.join(projectDir, "file.txt"), originalText, "utf-8");

    await expect(
      fsService.patchFile({
        projectId,
        path: "file.txt",
        expectedHash: "sha256:mismatch",
        replacements: [
          { search: "version 1", replace: "version 2" },
        ],
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.FILE_CONFLICT,
      })
    );
  });
});

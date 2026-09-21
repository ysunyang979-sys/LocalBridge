import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Universal FileSystem - Binary File Deletion Suite", () => {
  let tmpDir: string;
  let projectDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-bin-"));
    projectDir = path.join(tmpDir, "project");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(projectDir, { recursive: true });

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "test-myweb" });
    registry.setAccessMode(proj.id, "read-write");
    projectId = proj.id;

    backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("requires expectedHash when force=false and Full Control is not enabled", async () => {
    const pngName = "ChatGPT Image 2026年9月19日 20_01_15.png";
    const pngPath = path.join(projectDir, pngName);
    const mockPngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic bytes
      crypto.randomBytes(1024),
    ]);
    fs.writeFileSync(pngPath, mockPngBuffer);

    // Call without force and without expectedHash -> must throw VALIDATION_ERROR
    await expect(
      fsService.fsDelete({
        projectId,
        path: pngName,
        force: false,
      })
    ).rejects.toThrowError(/requires expectedHash unless force=true or Full Control is enabled/);

    expect(fs.existsSync(pngPath)).toBe(true);
  });

  it("successfully deletes binary PNG file when force=true", async () => {
    const pngName = "ChatGPT Image 2026年9月19日 20_01_15.png";
    const pngPath = path.join(projectDir, pngName);
    const mockPngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      crypto.randomBytes(4096),
    ]);
    fs.writeFileSync(pngPath, mockPngBuffer);

    const result = await fsService.fsDelete({
      projectId,
      path: pngName,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesAffected).toBe(1);
    expect(result.bytesAffected).toBe(mockPngBuffer.length);
    expect(fs.existsSync(pngPath)).toBe(false);
  });

  it("successfully deletes binary file when Full Control is enabled (even if force is omitted)", async () => {
    const binName = "compiled-model.dat";
    const binPath = path.join(projectDir, binName);
    const mockBinBuffer = crypto.randomBytes(8192);
    fs.writeFileSync(binPath, mockBinBuffer);

    // isFullControl = true passed via options
    const result = await fsService.fsDelete(
      {
        projectId,
        path: binName,
      },
      true // isFullControl
    );

    expect(result.success).toBe(true);
    expect(result.filesAffected).toBe(1);
    expect(result.bytesAffected).toBe(mockBinBuffer.length);
    expect(fs.existsSync(binPath)).toBe(false);
  });

  it("handles read-only binary files by resetting permissions and deleting", async () => {
    const readOnlyFile = "locked_archive.tar.gz";
    const target = path.join(projectDir, readOnlyFile);
    fs.writeFileSync(target, crypto.randomBytes(2048));
    // Set to read-only (0o444)
    fs.chmodSync(target, 0o444);

    const result = await fsService.fsDelete({
      projectId,
      path: readOnlyFile,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });
});

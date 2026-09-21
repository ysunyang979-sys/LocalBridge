import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";

describe("Universal FileSystem - Symlink & Junction No-Follow Safety Suite", () => {
  let tmpDir: string;
  let projectDir: string;
  let outsideDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-fs-symlink-"));
    projectDir = path.join(tmpDir, "project");
    outsideDir = path.join(tmpDir, "outside_world");
    const backupDir = path.join(tmpDir, "backups");

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Put a critical file outside the project sandbox
    fs.writeFileSync(
      path.join(outsideDir, "critical_external_data.txt"),
      "DO NOT DELETE THIS UNDER ANY CIRCUMSTANCES"
    );

    registry = new ProjectRegistry(path.join(tmpDir, "projects.json"));
    const proj = registry.add(projectDir, { name: "test-sandbox" });
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

  it("safely unlinks directory symlink without traversing or touching outside target files", async () => {
    const symlinkPath = path.join(projectDir, "symlink_to_outside");
    const symlinkType = process.platform === "win32" ? "junction" : "dir";

    try {
      fs.symlinkSync(outsideDir, symlinkPath, symlinkType);
    } catch (e) {
      // In case unprivileged Windows environment doesn't allow symlink, test might skip
      console.warn("Skipping symlink creation test if OS permissions deny symlink", e);
      return;
    }

    expect(fs.existsSync(symlinkPath)).toBe(true);
    expect(fs.existsSync(path.join(outsideDir, "critical_external_data.txt"))).toBe(true);

    // Perform delete directly on the symlink
    const result = await fsService.fsDelete({
      projectId,
      path: "symlink_to_outside",
      force: true,
    });

    expect(result.success).toBe(true);
    // Symlink inside project must be gone
    expect(fs.existsSync(symlinkPath)).toBe(false);

    // CRITICAL: Files in outsideDir MUST remain completely untouched!
    expect(fs.existsSync(path.join(outsideDir, "critical_external_data.txt"))).toBe(true);
    const content = fs.readFileSync(path.join(outsideDir, "critical_external_data.txt"), "utf-8");
    expect(content).toBe("DO NOT DELETE THIS UNDER ANY CIRCUMSTANCES");
  });

  it("safely removes symlink during recursive parent cleanup without traversing external target", async () => {
    const subFolder = path.join(projectDir, "my_subfolder");
    fs.mkdirSync(subFolder, { recursive: true });
    fs.writeFileSync(path.join(subFolder, "normal_file.txt"), "normal file");

    const symlinkInSubfolder = path.join(subFolder, "link_to_external");
    const symlinkType = process.platform === "win32" ? "junction" : "dir";

    try {
      fs.symlinkSync(outsideDir, symlinkInSubfolder, symlinkType);
    } catch (e) {
      console.warn("Skipping symlink creation test if OS permissions deny symlink", e);
      return;
    }

    // Recursively delete my_subfolder
    const result = await fsService.fsDelete({
      projectId,
      path: "my_subfolder",
      recursive: true,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(subFolder)).toBe(false);

    // External target directory and its files must be 100% intact!
    expect(fs.existsSync(path.join(outsideDir, "critical_external_data.txt"))).toBe(true);
  });
});

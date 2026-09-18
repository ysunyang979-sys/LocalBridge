import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService, MAX_BACKUPS_PER_PROJECT } from "../apps/runner/src/backup/service.js";
import { computeSha256 } from "../apps/runner/src/filesystem/hash.js";

describe("Filesystem Transaction Safety, Cleanup & Path Redaction", () => {
  let tmpDir: string;
  let projectDir: string;
  let backupDir: string;
  let registry: ProjectRegistry;
  let backupService: BackupService;
  let fsService: FilesystemService;
  let projectId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-safety-test-"));
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

  it("leaves zero temporary .tmp files in project directory after write operations", async () => {
    await fsService.createFile({
      projectId,
      path: "temp-check.txt",
      content: "Hello",
    });

    const hash1 = computeSha256("Hello");
    await fsService.writeFile({
      projectId,
      path: "temp-check.txt",
      expectedHash: hash1,
      content: "Hello World",
    });

    const hash2 = computeSha256("Hello World");
    await fsService.patchFile({
      projectId,
      path: "temp-check.txt",
      expectedHash: hash2,
      replacements: [{ search: "World", replace: "LocalBridge" }],
    });

    // Check all files in project directory
    const entries = fs.readdirSync(projectDir);
    expect(entries).toEqual(["temp-check.txt"]);

    const tmpFiles = entries.filter((f) => f.includes(".localbridge-") || f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });

  it("ensures backups are never stored inside the user project directory", async () => {
    fs.writeFileSync(path.join(projectDir, "important.txt"), "Original", "utf-8");
    const hash = computeSha256("Original");

    await fsService.writeFile({
      projectId,
      path: "important.txt",
      expectedHash: hash,
      content: "Modified",
    });

    // Backups must NOT be in project directory
    expect(fs.readdirSync(projectDir)).toEqual(["important.txt"]);

    // Backups MUST be in designated backupDir
    const projectBackups = fs.readdirSync(path.join(backupDir, projectId));
    expect(projectBackups.length).toBeGreaterThan(0);
  });

  it("enforces backup retention limit and evicts oldest backup when exceeded", async () => {
    fs.writeFileSync(path.join(projectDir, "history.txt"), "v0", "utf-8");
    let currentHash = computeSha256("v0");
    const operationIds: string[] = [];

    // Create MAX_BACKUPS_PER_PROJECT + 2 writes
    for (let i = 1; i <= MAX_BACKUPS_PER_PROJECT + 2; i++) {
      const newText = `v${i}`;
      const res = await fsService.writeFile({
        projectId,
        path: "history.txt",
        expectedHash: currentHash,
        content: newText,
      });
      operationIds.push(res.operationId);
      currentHash = res.newHash;
    }

    const backupEntries = fs.readdirSync(path.join(backupDir, projectId));
    expect(backupEntries.length).toBeLessThanOrEqual(MAX_BACKUPS_PER_PROJECT);

    // Oldest operation should have been evicted
    expect(fs.existsSync(path.join(backupDir, projectId, operationIds[0]!))).toBe(false);

    // Most recent operation must still exist
    const latestOp = operationIds[operationIds.length - 1]!;
    expect(fs.existsSync(path.join(backupDir, projectId, latestOp))).toBe(true);
  });

  it("strictly guarantees physical paths are redacted from all Phase 6 RPC response payloads", async () => {
    // 1. file.create
    const createRes = await fsService.createFile({
      projectId,
      path: "redacted.txt",
      content: "content 1",
    });
    const createStr = JSON.stringify(createRes);
    expect(createStr).not.toContain(projectDir);
    expect(createStr).not.toContain(tmpDir);
    expect(createStr).not.toMatch(/[a-zA-Z]:\\/);

    // 2. file.write
    const writeRes = await fsService.writeFile({
      projectId,
      path: "redacted.txt",
      expectedHash: createRes.newHash,
      content: "content 2",
    });
    const writeStr = JSON.stringify(writeRes);
    expect(writeStr).not.toContain(projectDir);
    expect(writeStr).not.toContain(tmpDir);
    expect(writeStr).not.toMatch(/[a-zA-Z]:\\/);

    // 3. file.patch
    const patchRes = await fsService.patchFile({
      projectId,
      path: "redacted.txt",
      expectedHash: writeRes.newHash,
      replacements: [{ search: "content 2", replace: "content 3" }],
    });
    const patchStr = JSON.stringify(patchRes);
    expect(patchStr).not.toContain(projectDir);
    expect(patchStr).not.toContain(tmpDir);
    expect(patchStr).not.toMatch(/[a-zA-Z]:\\/);

    // 4. file.delete
    const deleteRes = await fsService.deleteFile({
      projectId,
      path: "redacted.txt",
      expectedHash: patchRes.newHash,
    });
    const deleteStr = JSON.stringify(deleteRes);
    expect(deleteStr).not.toContain(projectDir);
    expect(deleteStr).not.toContain(tmpDir);
    expect(deleteStr).not.toMatch(/[a-zA-Z]:\\/);

    // 5. file.restore
    const restoreRes = await fsService.restoreFile({
      projectId,
      operationId: deleteRes.operationId,
    });
    const restoreStr = JSON.stringify(restoreRes);
    expect(restoreStr).not.toContain(projectDir);
    expect(restoreStr).not.toContain(tmpDir);
    expect(restoreStr).not.toMatch(/[a-zA-Z]:\\/);
  });
});

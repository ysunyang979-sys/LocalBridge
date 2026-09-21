import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ModelDownloadManager,
  REQUIRED_MODEL_FILES,
  validateModelDir,
} from "../packages/security/src/intelligence/downloader.js";

describe("Laya Existing Model Import Suite", () => {
  let sourceDir: string;
  let targetManagedDir: string;

  beforeEach(() => {
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-src-"));
    targetManagedDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-tgt-"));

    // Populate source with valid model artifacts
    for (const rel of REQUIRED_MODEL_FILES) {
      const full = path.join(sourceDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `test_weights_for_${rel}`);
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(targetManagedDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("Option A: imports model by reference without copying any files", async () => {
    const manager = new ModelDownloadManager(targetManagedDir);
    expect(manager.getStatus().installed).toBe(false);

    // Import with copyToManaged = false
    const status = await manager.importExistingModel(sourceDir, false);

    expect(status.installed).toBe(true);
    expect(status.status).toBe("ready");
    expect(status.modelPath).toBe(sourceDir);

    // Target managed dir should remain untouched
    const managedVal = validateModelDir(targetManagedDir);
    expect(managedVal.valid).toBe(false);
  });

  it("Option B: copies model to managed directory with zero network download", async () => {
    const manager = new ModelDownloadManager(targetManagedDir);
    expect(manager.getStatus().installed).toBe(false);

    // Import with copyToManaged = true
    const status = await manager.importExistingModel(sourceDir, true);

    expect(status.installed).toBe(true);
    expect(status.status).toBe("ready");
    // Verify target directory has all 5 files
    const targetVal = validateModelDir(status.modelPath);
    expect(targetVal.valid).toBe(true);
    expect(targetVal.missingFiles.length).toBe(0);
  });

  it("rejects import when source directory is incomplete", async () => {
    const incompleteDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-inc-"));
    fs.writeFileSync(path.join(incompleteDir, "model.safetensors"), "abc");

    const manager = new ModelDownloadManager(targetManagedDir);
    await expect(manager.importExistingModel(incompleteDir, false)).rejects.toThrow();

    fs.rmSync(incompleteDir, { recursive: true, force: true });
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ModelDownloadManager,
  REQUIRED_MODEL_FILES,
} from "../packages/security/src/intelligence/downloader.js";

describe("Laya Model Discovery Suite", () => {
  let tempManagedDir: string;
  let tempOtherDir: string;

  beforeEach(() => {
    tempManagedDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-managed-"));
    tempOtherDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-other-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempManagedDir, { recursive: true, force: true });
      fs.rmSync(tempOtherDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("initially returns not-installed if target directory is empty", () => {
    const manager = new ModelDownloadManager(tempManagedDir);
    const status = manager.getStatus();

    expect(status.installed).toBe(false);
    expect(status.status).toBe("not-installed");
    expect(status.modelPath).toBe(tempManagedDir);
  });

  it("dynamically discovers manually placed model artifacts on disk", () => {
    const manager = new ModelDownloadManager(tempManagedDir);
    expect(manager.getStatus().installed).toBe(false);

    // Simulate user copying files into targetDir manually
    for (const rel of REQUIRED_MODEL_FILES) {
      const full = path.join(tempManagedDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "binary_weights_payload");
    }

    // Next getStatus() call must auto-discover the files without restart
    const status = manager.getStatus();
    expect(status.installed).toBe(true);
    expect(status.status).toBe("ready");
    expect(status.error).toBeNull();
  });

  it("allows setting custom target directory and auto-discovering its contents", () => {
    const manager = new ModelDownloadManager(tempManagedDir);
    expect(manager.getStatus().installed).toBe(false);

    // Populate tempOtherDir with complete model
    for (const rel of REQUIRED_MODEL_FILES) {
      const full = path.join(tempOtherDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "valid_model_payload");
    }

    // Point manager to custom directory
    const nextStatus = manager.setTargetDir(tempOtherDir);
    expect(nextStatus.installed).toBe(true);
    expect(nextStatus.status).toBe("ready");
    expect(nextStatus.modelPath).toBe(tempOtherDir);
  });
});

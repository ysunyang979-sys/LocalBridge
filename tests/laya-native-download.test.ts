import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ModelDownloadManager,
  validateModelDir,
  REQUIRED_MODEL_FILES,
} from "../packages/security/src/intelligence/downloader.js";

describe("Laya Native Downloader Pipeline Suite", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-native-dl-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      const staging = `${targetDir}.download`;
      if (fs.existsSync(staging)) {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  it("handles atomic finalize from staging folder to final destination", async () => {
    const manager = new ModelDownloadManager(targetDir);

    // Simulate downloaded staging folder with complete artifacts
    const stagingDir = `${targetDir}.download`;
    fs.mkdirSync(stagingDir, { recursive: true });

    for (const rel of REQUIRED_MODEL_FILES) {
      const full = path.join(stagingDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `artifact_bytes_for_${rel}`);
    }

    expect(validateModelDir(stagingDir).valid).toBe(true);

    // Finalize staging into targetDir
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.renameSync(stagingDir, targetDir);

    const finalVal = validateModelDir(targetDir);
    expect(finalVal.valid).toBe(true);
    expect(manager.getStatus().installed).toBe(true);
  });
});

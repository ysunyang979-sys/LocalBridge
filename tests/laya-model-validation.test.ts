import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateModelDir,
  REQUIRED_MODEL_FILES,
} from "../packages/security/src/intelligence/downloader.js";

describe("Laya Model Validation Suite", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-val-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("fails validation if directory does not exist", () => {
    const nonExistent = path.join(tempDir, "does_not_exist");
    const res = validateModelDir(nonExistent);
    expect(res.valid).toBe(false);
    expect(res.missingFiles.length).toBe(REQUIRED_MODEL_FILES.length);
    expect(res.error).toContain("does not exist");
  });

  it("fails validation if directory is empty", () => {
    const res = validateModelDir(tempDir);
    expect(res.valid).toBe(false);
    expect(res.missingFiles).toEqual([...REQUIRED_MODEL_FILES]);
    expect(res.error).toContain("Missing or incomplete required model files");
  });

  it("fails validation if only some files are present", () => {
    // Create only model.safetensors
    fs.writeFileSync(path.join(tempDir, "model.safetensors"), "dummy_data");
    const res = validateModelDir(tempDir);
    expect(res.valid).toBe(false);
    expect(res.missingFiles).not.toContain("model.safetensors");
    expect(res.missingFiles).toContain("rl_agent_config.json");
    expect(res.missingFiles).toContain("encoder/config.json");
  });

  it("fails validation if a required file has 0 bytes (corrupt)", () => {
    for (const rel of REQUIRED_MODEL_FILES) {
      const full = path.join(tempDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, rel === "rl_agent_config.json" ? "" : "content");
    }
    const res = validateModelDir(tempDir);
    expect(res.valid).toBe(false);
    expect(res.missingFiles.some((f) => f.includes("rl_agent_config.json"))).toBe(true);
  });

  it("passes validation when all 5 files exist with non-zero size", () => {
    let expectedBytes = 0;
    for (const rel of REQUIRED_MODEL_FILES) {
      const full = path.join(tempDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const content = `content_for_${rel}`;
      fs.writeFileSync(full, content);
      expectedBytes += Buffer.byteLength(content);
    }
    const res = validateModelDir(tempDir);
    expect(res.valid).toBe(true);
    expect(res.missingFiles).toEqual([]);
    expect(res.totalBytes).toBe(expectedBytes);
    expect(res.error).toBeNull();
  });
});

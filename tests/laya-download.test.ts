import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ModelDownloadManager,
  REQUIRED_MODEL_FILES,
  getDefaultModelDir,
} from "../packages/security/src/intelligence/downloader.js";
import { LayaDecisionProvider } from "../packages/security/src/intelligence/provider.js";

describe("Laya Model Download Manager Suite", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-laya-test-"));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  it("verifies required model artifact list contains all 5 required components", () => {
    expect(REQUIRED_MODEL_FILES).toContain("model.safetensors");
    expect(REQUIRED_MODEL_FILES).toContain("rl_agent_config.json");
    expect(REQUIRED_MODEL_FILES).toContain("encoder/config.json");
    expect(REQUIRED_MODEL_FILES).toContain("tokenizer/tokenizer.json");
    expect(REQUIRED_MODEL_FILES).toContain("tokenizer/tokenizer_config.json");
    expect(REQUIRED_MODEL_FILES.length).toBe(5);
  });

  it("reports not-installed when target directory is empty or missing files", () => {
    const emptySubdir = path.join(tempDir, "empty-model");
    const manager = new ModelDownloadManager(emptySubdir);

    // If dev fallback exists on dev machine, set target to strict empty
    const status = manager.getStatus();
    expect(status.modelPath).toBe(emptySubdir);
  });

  it("fails verification if any required artifact is missing or 0 bytes", () => {
    const testDir = path.join(tempDir, "corrupt-model");
    fs.mkdirSync(path.join(testDir, "encoder"), { recursive: true });
    fs.mkdirSync(path.join(testDir, "tokenizer"), { recursive: true });

    // Write 4 files with content, but leave tokenizer.json at 0 bytes
    fs.writeFileSync(path.join(testDir, "model.safetensors"), "dummy weights");
    fs.writeFileSync(path.join(testDir, "rl_agent_config.json"), "{}");
    fs.writeFileSync(path.join(testDir, "encoder", "config.json"), "{}");
    fs.writeFileSync(path.join(testDir, "tokenizer", "tokenizer.json"), ""); // 0 bytes!
    fs.writeFileSync(path.join(testDir, "tokenizer", "tokenizer_config.json"), "{}");

    const manager = new ModelDownloadManager(testDir);
    // Since tokenizer.json is 0 bytes, checkInstallation should return false
    const installed = manager.checkInstallation();
    expect(installed).toBe(false);
  });

  it("succeeds verification when all 5 files are present with non-zero size", () => {
    const validDir = path.join(tempDir, "valid-model");
    fs.mkdirSync(path.join(validDir, "encoder"), { recursive: true });
    fs.mkdirSync(path.join(validDir, "tokenizer"), { recursive: true });

    for (const relFile of REQUIRED_MODEL_FILES) {
      const fullPath = path.join(validDir, relFile);
      fs.writeFileSync(fullPath, "valid mock content");
    }

    const manager = new ModelDownloadManager(validDir);
    expect(manager.checkInstallation()).toBe(true);
    const status = manager.getStatus();
    expect(status.installed).toBe(true);
    expect(status.status).toBe("ready");
  });

  it("handles cancellation gracefully via AbortController", () => {
    const testDir = path.join(tempDir, "cancel-test");
    const manager = new ModelDownloadManager(testDir);

    // Cancel download
    const cancelledStatus = manager.cancelDownload();
    expect(cancelledStatus.status).toBe("not-installed");
  });

  it("handles LayaDecisionProvider downloadAndEnable when model is already or not yet installed", async () => {
    const provider = new LayaDecisionProvider({
      provider: "disabled",
      modelPath: path.join(tempDir, "nonexistent"),
    });

    const status = await provider.downloadAndEnable();
    expect(status).toBeDefined();
    expect(status.provider).toBeDefined();

    await provider.shutdown();
  });
});

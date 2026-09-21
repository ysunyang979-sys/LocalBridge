import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ModelDownloadManager } from "../packages/security/src/intelligence/downloader.js";

describe("Laya Download Cancel Suite", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-cancel-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("resets download state when cancelDownload is called", async () => {
    const manager = new ModelDownloadManager(targetDir);
    expect(manager.getStatus().installed).toBe(false);

    // Call cancelDownload
    const status = manager.cancelDownload();
    expect(status.status).toBe("not-installed");
    expect(status.progress).toBeNull();
  });
});

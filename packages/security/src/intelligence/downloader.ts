import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import type {
  ModelDownloadProgress,
  ModelDownloadStatus,
  ModelStatusDto,
} from "@localbridge/protocol";

export const REQUIRED_MODEL_FILES = [
  "model.safetensors",
  "rl_agent_config.json",
  "encoder/config.json",
  "tokenizer/tokenizer.json",
  "tokenizer/tokenizer_config.json",
] as const;

export const HF_MODEL_REPO = "convaiinnovations/laya-multilingual";
export const HF_BASE_URL = `https://huggingface.co/${HF_MODEL_REPO}/resolve/main`;

export function getDefaultModelDir(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "LocalBridge", "models", "laya-multilingual");
  }
  return path.join(os.homedir(), ".localbridge", "models", "laya-multilingual");
}

export class ModelDownloadManager {
  private targetDir: string;
  private status: ModelDownloadStatus = "not-installed";
  private progress: ModelDownloadProgress | null = null;
  private lastError: string | null = null;
  private abortController: AbortController | null = null;
  private downloadStartTime = 0;

  constructor(targetDir?: string) {
    this.targetDir = targetDir || getDefaultModelDir();
    this.checkInstallation();
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  setTargetDir(dir: string): void {
    this.targetDir = dir;
    this.checkInstallation();
  }

  /**
   * Verifies if the required model artifacts are present and non-empty.
   */
  checkInstallation(): boolean {
    if (this.status === "downloading" || this.status === "verifying") {
      return false;
    }

    // First check target directory
    if (this.verifyDirectoryFiles(this.targetDir)) {
      this.status = "ready";
      this.lastError = null;
      return true;
    }

    // Fallback: Check local dev path if on dev machine and targetDir is the default dir
    if (this.targetDir === getDefaultModelDir()) {
      const devFallback = path.resolve("E:/workspace/models/laya-multilingual");
      if (fs.existsSync(devFallback) && this.verifyDirectoryFiles(devFallback)) {
        // If dev fallback exists, consider ready or point to it
        this.status = "ready";
        this.lastError = null;
        return true;
      }
    }

    this.status = "not-installed";
    return false;
  }

  private verifyDirectoryFiles(dir: string): boolean {
    if (!fs.existsSync(dir)) return false;
    for (const relFile of REQUIRED_MODEL_FILES) {
      const fullPath = path.join(dir, relFile);
      if (!fs.existsSync(fullPath)) return false;
      const stat = fs.statSync(fullPath);
      if (stat.size === 0) return false;
    }
    return true;
  }

  getStatus(): ModelStatusDto {
    const isInstalled = this.status === "ready" || this.verifyDirectoryFiles(this.targetDir);
    return {
      installed: isInstalled,
      status: isInstalled ? "ready" : this.status,
      modelPath: this.targetDir,
      progress: this.progress,
      error: this.lastError,
    };
  }

  cancelDownload(): ModelStatusDto {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.status === "downloading" || this.status === "verifying") {
      this.status = "not-installed";
      this.progress = null;
      this.lastError = "Download cancelled by user";
    }
    return this.getStatus();
  }

  async startDownload(): Promise<ModelStatusDto> {
    if (this.status === "ready") {
      return this.getStatus();
    }
    if (this.status === "downloading" || this.status === "verifying") {
      return this.getStatus();
    }

    this.status = "downloading";
    this.lastError = null;
    this.abortController = new AbortController();
    this.downloadStartTime = Date.now();

    const totalEstimatedBytes = 678_201_657; // ~678 MB
    this.progress = {
      totalBytes: totalEstimatedBytes,
      downloadedBytes: 0,
      percent: 0,
      speedBytesPerSec: 0,
      currentFile: REQUIRED_MODEL_FILES[0],
    };

    // Run async download pipeline in background
    this.executeDownloadPipeline().catch((err) => {
      this.status = "error";
      this.lastError = err.message || "Failed to download model";
      this.progress = null;
    });

    return this.getStatus();
  }

  private async executeDownloadPipeline(): Promise<void> {
    const stagingDir = `${this.targetDir}.download`;
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }

    // Check if dev folder exists on this machine for high-speed local seeding
    const devFallback = path.resolve("E:/workspace/models/laya-multilingual");
    const canLocalSeed = fs.existsSync(devFallback) && this.verifyDirectoryFiles(devFallback);

    let cumulativeDownloaded = 0;
    const totalEstimatedBytes = 678_201_657;

    for (const relFile of REQUIRED_MODEL_FILES) {
      if (this.abortController?.signal.aborted) {
        return;
      }

      const destFile = path.join(stagingDir, relFile);
      const destDir = path.dirname(destFile);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      this.progress = {
        totalBytes: totalEstimatedBytes,
        downloadedBytes: cumulativeDownloaded,
        percent: Math.min(99, Math.round((cumulativeDownloaded / totalEstimatedBytes) * 100)),
        speedBytesPerSec: 12_500_000,
        currentFile: relFile,
      };

      if (canLocalSeed) {
        // Fast local seed: stream copy from dev fallback with progress simulation
        const srcFile = path.join(devFallback, relFile);
        const stat = fs.statSync(srcFile);
        fs.copyFileSync(srcFile, destFile);
        cumulativeDownloaded += stat.size;
      } else {
        // Real HTTPS download from HuggingFace
        const fileUrl = `${HF_BASE_URL}/${relFile}`;
        const downloadedBytes = await this.downloadSingleFile(fileUrl, destFile);
        cumulativeDownloaded += downloadedBytes;
      }

      const elapsedSec = Math.max(0.1, (Date.now() - this.downloadStartTime) / 1000);
      const speed = Math.round(cumulativeDownloaded / elapsedSec);

      this.progress = {
        totalBytes: totalEstimatedBytes,
        downloadedBytes: cumulativeDownloaded,
        percent: Math.min(99, Math.round((cumulativeDownloaded / totalEstimatedBytes) * 100)),
        speedBytesPerSec: speed,
        currentFile: relFile,
      };
    }

    if (this.abortController?.signal.aborted) {
      return;
    }

    // Verification phase
    this.status = "verifying";
    this.progress = {
      totalBytes: totalEstimatedBytes,
      downloadedBytes: totalEstimatedBytes,
      percent: 100,
      speedBytesPerSec: 0,
      currentFile: "Verifying artifacts...",
    };

    const valid = this.verifyDirectoryFiles(stagingDir);
    if (!valid) {
      this.status = "error";
      this.lastError = "Downloaded artifacts verification failed: missing or corrupt files";
      return;
    }

    // Atomic finalize
    if (fs.existsSync(this.targetDir)) {
      try {
        fs.rmSync(this.targetDir, { recursive: true, force: true });
      } catch {
        // Ignore removal error
      }
    }

    const parent = path.dirname(this.targetDir);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    fs.renameSync(stagingDir, this.targetDir);

    this.status = "ready";
    this.progress = null;
    this.lastError = null;
  }

  private downloadSingleFile(fileUrl: string, destPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let existingBytes = 0;
      if (fs.existsSync(destPath)) {
        existingBytes = fs.statSync(destPath).size;
      }

      const headers: Record<string, string> = {};
      if (existingBytes > 0) {
        headers["Range"] = `bytes=${existingBytes}-`;
      }

      const fileStream = fs.createWriteStream(destPath, {
        flags: existingBytes > 0 ? "a" : "w",
      });

      const req = https.get(fileUrl, { headers }, (res) => {
        // Handle redirect
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fileStream.close();
          const redirectUrl = res.headers.location;
          this.downloadSingleFile(redirectUrl, destPath)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          fileStream.close();
          reject(new Error(`HTTP ${res.statusCode} when fetching ${fileUrl}`));
          return;
        }

        let downloaded = existingBytes;
        res.on("data", (chunk) => {
          if (this.abortController?.signal.aborted) {
            req.destroy();
            fileStream.close();
            return;
          }
          downloaded += chunk.length;
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          resolve(downloaded);
        });

        fileStream.on("error", (err) => {
          fileStream.close();
          reject(err);
        });
      });

      req.on("error", (err) => {
        fileStream.close();
        reject(err);
      });

      this.abortController?.signal.addEventListener("abort", () => {
        req.destroy();
        fileStream.close();
        resolve(existingBytes);
      });
    });
  }
}

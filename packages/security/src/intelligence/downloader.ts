import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { execSync } from "node:child_process";
import type {
  ModelDownloadProgress,
  ModelDownloadStatus,
  ModelStatusDto,
  ModelDownloadOptions,
  ModelValidationResult,
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

export function getDevFallbackModelDir(): string {
  return path.resolve("E:/workspace/models/laya-multilingual");
}

export function normalizeProxyUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    s = `http://${s}`;
  }
  return s;
}

/**
 * Resolves system proxy on Windows from Internet Settings registry or environment variables.
 */
export function resolveSystemProxy(): string | null {
  if (process.platform === "win32") {
    try {
      const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"', {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });

      let proxyEnable = 0;
      let proxyServer: string | null = null;

      for (const line of out.split(/\r?\n/)) {
        const trimmed = line.trim();
        const parts = trimmed.split(/\s+/);
        if (trimmed.startsWith("ProxyEnable")) {
          const p2 = parts[2];
          if (p2) {
            const val = p2.replace(/^0x/, "");
            proxyEnable = parseInt(val, 16) || 0;
          }
        } else if (trimmed.startsWith("ProxyServer")) {
          if (parts.length >= 3) {
            proxyServer = parts.slice(2).join(" ");
          }
        }
      }

      if (proxyEnable === 1 && proxyServer) {
        if (proxyServer.includes("https=")) {
          const m = proxyServer.match(/https=([^;]+)/);
          if (m && m[1]) return normalizeProxyUrl(m[1]);
        }
        if (proxyServer.includes("http=")) {
          const m = proxyServer.match(/http=([^;]+)/);
          if (m && m[1]) return normalizeProxyUrl(m[1]);
        }
        return normalizeProxyUrl(proxyServer);
      }
    } catch {
      // Fall through to environment variables
    }
  }

  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY;

  if (envProxy && envProxy.trim()) {
    return normalizeProxyUrl(envProxy.trim());
  }

  return null;
}

/**
 * Validates whether the given directory contains all 5 required Laya model artifacts.
 */
export function validateModelDir(dirPath: string): ModelValidationResult {
  const missingFiles: string[] = [];
  let totalBytes = 0;

  if (!fs.existsSync(dirPath)) {
    return {
      valid: false,
      modelPath: dirPath,
      missingFiles: [...REQUIRED_MODEL_FILES],
      totalBytes: 0,
      error: `Model directory does not exist: ${dirPath}`,
    };
  }

  for (const relFile of REQUIRED_MODEL_FILES) {
    const fullPath = path.join(dirPath, relFile);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(relFile);
      continue;
    }
    const stat = fs.statSync(fullPath);
    if (stat.size === 0) {
      missingFiles.push(`${relFile} (empty file)`);
      continue;
    }
    totalBytes += stat.size;
  }

  if (missingFiles.length > 0) {
    return {
      valid: false,
      modelPath: dirPath,
      missingFiles,
      totalBytes,
      error: `Missing or incomplete required model files: ${missingFiles.join(", ")}`,
    };
  }

  return {
    valid: true,
    modelPath: dirPath,
    missingFiles: [],
    totalBytes,
    error: null,
  };
}

/**
 * Creates an https.Agent that tunnels HTTPS traffic through an HTTP proxy via HTTP CONNECT.
 */
export function createHttpConnectProxyAgent(proxyUrlStr: string): https.Agent {
  const parsedProxy = new URL(proxyUrlStr);
  const proxyHost = parsedProxy.hostname;
  const proxyPort = parseInt(parsedProxy.port || "80", 10);

  const agent = new https.Agent({ keepAlive: true });
  (agent as any).createConnection = function (
    options: any,
    callback: (err: Error | null, socket?: any) => void
  ) {
    const targetHost = options.host || options.hostname;
    const targetPort = options.port || 443;

    const req = http.request({
        host: proxyHost,
        port: proxyPort,
        method: "CONNECT",
        path: `${targetHost}:${targetPort}`,
        headers: {
          Host: `${targetHost}:${targetPort}`,
          ...(parsedProxy.username
            ? {
                "Proxy-Authorization": `Basic ${Buffer.from(
                  `${decodeURIComponent(parsedProxy.username)}:${decodeURIComponent(parsedProxy.password || "")}`
                ).toString("base64")}`,
              }
            : {}),
        },
      });

      req.on("connect", (res, socket, _head) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          return callback(new Error(`Proxy CONNECT failed with status ${res.statusCode} ${res.statusMessage || ""}`));
        }

        const tlsSocket = tls.connect({
          socket,
          servername: targetHost,
        });

        tlsSocket.on("error", (err) => callback(err));
        return callback(null, tlsSocket);
      });

      req.on("error", (err) => callback(err));
      req.end();
    };
    return agent;
  }

export class ModelDownloadManager {
  private targetDir: string;
  private status: ModelDownloadStatus = "not-installed";
  private progress: ModelDownloadProgress | null = null;
  private lastError: string | null = null;
  private abortController: AbortController | null = null;
  private downloadStartTime = 0;
  private activeProxyUrl: string | null = null;

  constructor(targetDir?: string) {
    this.targetDir = targetDir || getDefaultModelDir();
    this.checkInstallation();
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  setTargetDir(dir: string): ModelStatusDto {
    this.targetDir = dir;
    this.checkInstallation();
    return this.getStatus();
  }

  validateDirectory(dir: string): ModelValidationResult {
    return validateModelDir(dir);
  }

  /**
   * Scans target directory and auto-discovers model artifacts.
   * Never relies purely on an old in-memory flag.
   */
  checkInstallation(): boolean {
    if (this.status === "downloading" || this.status === "verifying") {
      return false;
    }

    const res = validateModelDir(this.targetDir);
    if (res.valid) {
      this.status = "ready";
      this.lastError = null;
      return true;
    }

    // If target directory is the default location and not yet populated,
    // check if a known local dev repository is present (e.g. E:\workspace\models\laya-multilingual)
    if (this.targetDir === getDefaultModelDir()) {
      const devFallback = getDevFallbackModelDir();
      const devRes = validateModelDir(devFallback);
      if (devRes.valid) {
        // Known local model exists. Switch targetDir to it so it is immediately ready.
        this.targetDir = devFallback;
        this.status = "ready";
        this.lastError = null;
        return true;
      }
    }

    this.status = "not-installed";
    return false;
  }

  getStatus(): ModelStatusDto {
    if (this.status !== "downloading" && this.status !== "verifying") {
      this.checkInstallation();
    }
    const isInstalled = this.status === "ready";
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

  /**
   * Import an existing model from a source directory.
   * If copyToManaged is false: points targetDir to the existing location.
   * If copyToManaged is true: copies files locally into default AppData directory without network download.
   */
  async importExistingModel(sourceDir: string, copyToManaged = false): Promise<ModelStatusDto> {
    const validation = validateModelDir(sourceDir);
    if (!validation.valid) {
      this.lastError = validation.error || "Selected directory does not contain complete Laya model artifacts";
      throw new Error(this.lastError);
    }

    if (!copyToManaged) {
      this.targetDir = sourceDir;
      this.status = "ready";
      this.lastError = null;
      this.progress = null;
      return this.getStatus();
    }

    // Copy to managed directory
    const destDir = this.targetDir || getDefaultModelDir();
    this.status = "verifying";
    this.lastError = null;
    this.downloadStartTime = Date.now();

    const totalBytes = validation.totalBytes || 678_201_657;
    let copiedBytes = 0;

    for (const relFile of REQUIRED_MODEL_FILES) {
      const srcFile = path.join(sourceDir, relFile);
      const targetFile = path.join(destDir, relFile);
      const parentDir = path.dirname(targetFile);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const stat = fs.statSync(srcFile);
      fs.copyFileSync(srcFile, targetFile);
      copiedBytes += stat.size;

      this.progress = {
        totalBytes,
        downloadedBytes: copiedBytes,
        percent: Math.min(100, Math.round((copiedBytes / totalBytes) * 100)),
        speedBytesPerSec: 50_000_000,
        currentFile: `Importing ${relFile}...`,
      };
    }

    const finalValidation = validateModelDir(destDir);
    if (!finalValidation.valid) {
      this.status = "error";
      this.lastError = finalValidation.error || "Failed to verify imported model files in target directory";
      this.progress = null;
      throw new Error(this.lastError);
    }

    this.targetDir = destDir;
    this.status = "ready";
    this.progress = null;
    this.lastError = null;
    return this.getStatus();
  }

  async startDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto> {
    if (this.status === "ready") {
      return this.getStatus();
    }
    if (this.status === "downloading" || this.status === "verifying") {
      return this.getStatus();
    }

    // Resolve proxy
    let proxyUrl: string | null = null;
    const mode = options?.proxyMode || "system";

    if (mode === "custom" && options?.customProxyUrl) {
      proxyUrl = normalizeProxyUrl(options.customProxyUrl);
    } else if (mode === "system") {
      proxyUrl = resolveSystemProxy();
    }

    this.activeProxyUrl = proxyUrl;
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

    // If local dev folder exists with complete artifacts, seed locally
    const devFallback = getDevFallbackModelDir();
    const canLocalSeed = fs.existsSync(devFallback) && validateModelDir(devFallback).valid;

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
        // Fast local seeding
        const srcFile = path.join(devFallback, relFile);
        const stat = fs.statSync(srcFile);
        fs.copyFileSync(srcFile, destFile);
        cumulativeDownloaded += stat.size;
      } else {
        // Real Native HTTPS download over Proxy
        const fileUrl = `${HF_BASE_URL}/${relFile}`;
        const downloadedBytes = await this.downloadSingleFileWithResume(fileUrl, destFile);
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

    const validResult = validateModelDir(stagingDir);
    if (!validResult.valid) {
      this.status = "error";
      this.lastError = validResult.error || "Downloaded artifacts verification failed: missing or corrupt files";
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

  /**
   * Downloads a single file with Range header resume support, following redirects up to 5 times.
   */
  downloadSingleFileWithResume(
    fileUrl: string,
    destPath: string,
    redirectHops = 0
  ): Promise<number> {
    if (redirectHops > 5) {
      return Promise.reject(new Error("Too many redirects during model download"));
    }

    const partPath = `${destPath}.part`;

    return new Promise((resolve, reject) => {
      let existingBytes = 0;
      if (fs.existsSync(partPath)) {
        existingBytes = fs.statSync(partPath).size;
      }

      const headers: Record<string, string> = {
        "User-Agent": "Nexus-Native-Downloader/1.2.0",
      };

      if (existingBytes > 0) {
        headers["Range"] = `bytes=${existingBytes}-`;
      }

      let agent: https.Agent | undefined;
      if (this.activeProxyUrl) {
        try {
          agent = createHttpConnectProxyAgent(this.activeProxyUrl);
        } catch (e: any) {
          return reject(new Error(`Failed to initialize proxy agent (${this.activeProxyUrl}): ${e.message}`));
        }
      }

      const parsedUrl = new URL(fileUrl);
      const reqOptions: https.RequestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers,
        agent,
      };

      const req = https.request(reqOptions, (res) => {
        // Follow redirect (e.g. HuggingFace -> AWS CloudFront S3 CDN)
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, fileUrl).toString();

          this.downloadSingleFileWithResume(redirectUrl, destPath, redirectHops + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        // 206 = Partial Content (resumed), 200 = OK (full content)
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ""} when downloading ${fileUrl}`));
          return;
        }

        const isAppend = res.statusCode === 206 && existingBytes > 0;
        const fileStream = fs.createWriteStream(partPath, {
          flags: isAppend ? "a" : "w",
        });

        let currentDownloaded = isAppend ? existingBytes : 0;

        res.on("data", (chunk) => {
          if (this.abortController?.signal.aborted) {
            req.destroy();
            fileStream.close();
            return;
          }
          currentDownloaded += chunk.length;
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          // Rename .part to destPath
          try {
            if (fs.existsSync(destPath)) {
              fs.rmSync(destPath, { force: true });
            }
            fs.renameSync(partPath, destPath);
          } catch (err) {
            return reject(err);
          }
          resolve(currentDownloaded);
        });

        fileStream.on("error", (err) => {
          fileStream.close();
          reject(err);
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      this.abortController?.signal.addEventListener("abort", () => {
        req.destroy();
        resolve(existingBytes);
      });

      req.end();
    });
  }
}

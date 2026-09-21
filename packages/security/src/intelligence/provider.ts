import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type {
  DecisionContext,
  DecisionAdvice,
  DecisionProviderConfig,
  IntelligenceStatusDto,
  IntelligenceWorkerStatus,
  ModelStatusDto,
} from "@localbridge/protocol";
import { sanitizeDecisionContext } from "./redaction.js";
import {
  ModelDownloadManager,
  getDefaultModelDir,
} from "./downloader.js";

export function resolveDefaultPythonPath(): string {
  if (
    process.env.LOCALBRIDGE_LAYA_PYTHON_PATH &&
    fs.existsSync(process.env.LOCALBRIDGE_LAYA_PYTHON_PATH)
  ) {
    return process.env.LOCALBRIDGE_LAYA_PYTHON_PATH;
  }
  const devConda = path.resolve("E:/Tools/Anado/Anaa/envs/nexus-laya/python.exe");
  if (fs.existsSync(devConda)) {
    return devConda;
  }
  return "python";
}

export function resolveDefaultModelPath(): string {
  const prodModel = getDefaultModelDir();
  if (fs.existsSync(prodModel)) {
    return prodModel;
  }
  const devModel = path.resolve("E:/workspace/models/laya-multilingual");
  if (fs.existsSync(devModel)) {
    return devModel;
  }
  return prodModel;
}

export interface DecisionProvider {
  getAdvice(context: DecisionContext): Promise<DecisionAdvice>;
  getStatus(): IntelligenceStatusDto;
  getModelStatus(): ModelStatusDto;
  startModelDownload(): Promise<ModelStatusDto>;
  cancelModelDownload(): ModelStatusDto;
  downloadAndEnable(): Promise<IntelligenceStatusDto>;
  updateConfig(config: Partial<DecisionProviderConfig>): Promise<IntelligenceStatusDto>;
  shutdown(): Promise<void>;
}

export class DisabledDecisionProvider implements DecisionProvider {
  private downloadManager: ModelDownloadManager;

  constructor(downloadManager?: ModelDownloadManager) {
    this.downloadManager = downloadManager || new ModelDownloadManager();
  }

  getAdvice(_context: DecisionContext): Promise<DecisionAdvice> {
    return Promise.resolve({
      provider: "disabled",
      risk: {
        label: "medium",
        confidence: 0.5,
      },
      approval: {
        recommended: true,
        confidence: 0.5,
      },
      category: null,
      routing: {},
      reasoningTags: ["intelligence_disabled"],
      latencyMs: 0,
      model: "none",
      advisoryOnly: true,
    });
  }

  getStatus(): IntelligenceStatusDto {
    return {
      provider: "disabled",
      status: "disabled",
      model: "Disabled",
      execution: "local",
      language: "Multilingual (100+ languages)",
      modelPath: this.downloadManager.getTargetDir(),
      pythonPath: resolveDefaultPythonPath(),
      lastError: null,
    };
  }

  getModelStatus(): ModelStatusDto {
    return this.downloadManager.getStatus();
  }

  startModelDownload(): Promise<ModelStatusDto> {
    return this.downloadManager.startDownload();
  }

  cancelModelDownload(): ModelStatusDto {
    return this.downloadManager.cancelDownload();
  }

  downloadAndEnable(): Promise<IntelligenceStatusDto> {
    return Promise.resolve(this.getStatus());
  }

  updateConfig(_config: Partial<DecisionProviderConfig>): Promise<IntelligenceStatusDto> {
    return Promise.resolve(this.getStatus());
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

interface PendingRequest {
  resolve: (advice: DecisionAdvice) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class LayaDecisionProvider implements DecisionProvider {
  private config: DecisionProviderConfig;
  private workerProcess: ChildProcess | null = null;
  private status: IntelligenceWorkerStatus = "disabled";
  private lastError: string | null = null;
  private lastLatencyMs = 0;
  private reqCounter = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private isShuttingDown = false;
  private downloadManager: ModelDownloadManager;

  constructor(
    config: Partial<DecisionProviderConfig> = {},
    downloadManager?: ModelDownloadManager
  ) {
    const defaultModel = resolveDefaultModelPath();
    const defaultPython = resolveDefaultPythonPath();

    this.config = {
      provider: config.provider || "laya",
      modelPath: config.modelPath || defaultModel,
      pythonPath: config.pythonPath || defaultPython,
      workerTimeoutMs: config.workerTimeoutMs || 5000,
    };

    this.downloadManager = downloadManager || new ModelDownloadManager(this.config.modelPath);

    if (this.config.provider === "laya") {
      this.initWorker();
    }
  }

  getModelStatus(): ModelStatusDto {
    return this.downloadManager.getStatus();
  }

  startModelDownload(): Promise<ModelStatusDto> {
    return this.downloadManager.startDownload();
  }

  cancelModelDownload(): ModelStatusDto {
    return this.downloadManager.cancelDownload();
  }

  async downloadAndEnable(): Promise<IntelligenceStatusDto> {
    // 1. Download model if needed
    const modelStatus = this.downloadManager.getStatus();
    if (!modelStatus.installed) {
      await this.downloadManager.startDownload();
      // Wait for download to finish (or error)
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const curr = this.downloadManager.getStatus();
        if (curr.installed) break;
        if (curr.status === "error") {
          throw new Error(curr.error || "Model download failed");
        }
      }
    }

    // 2. Enable provider and boot worker
    return this.updateConfig({
      provider: "laya",
      modelPath: this.downloadManager.getTargetDir(),
    });
  }

  private initWorker(): void {
    if (this.workerProcess || this.isShuttingDown) return;

    this.status = "loading";
    this.lastError = null;

    try {
      const workerScript = path.resolve(
        process.cwd(),
        "scripts",
        "laya_worker.py"
      );

      this.workerProcess = spawn(this.config.pythonPath, [workerScript], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      if (!this.workerProcess.stdout || !this.workerProcess.stdin) {
        throw new Error("Failed to open stdio pipes for Laya worker");
      }

      const rl = readline.createInterface({
        input: this.workerProcess.stdout,
        terminal: false,
      });

      rl.on("line", (line) => {
        this.handleWorkerLine(line);
      });

      this.workerProcess.stderr?.on("data", (chunk) => {
        const msg = chunk.toString();
        if (msg.includes("ERROR") || msg.includes("error")) {
          this.lastError = msg.trim();
        }
      });

      this.workerProcess.on("exit", (code) => {
        this.workerProcess = null;
        if (!this.isShuttingDown) {
          this.status = "offline";
          this.lastError = `Worker process exited with code ${code}`;
          // Reject any pending requests with safe fallback
          for (const [id, req] of this.pendingRequests.entries()) {
            clearTimeout(req.timer);
            req.resolve(this.getFallbackAdvice("worker_crash"));
            this.pendingRequests.delete(id);
          }
        }
      });

      this.workerProcess.on("error", (err) => {
        this.status = "error";
        this.lastError = err.message;
      });

      // Send initial configuration to worker
      this.sendToWorker({
        type: "init",
        model_path: this.config.modelPath,
      });
    } catch (err: any) {
      this.status = "error";
      this.lastError = err.message || "Failed to spawn Laya worker";
    }
  }

  private sendToWorker(data: Record<string, unknown>): boolean {
    if (!this.workerProcess?.stdin || this.workerProcess.stdin.destroyed) {
      return false;
    }
    try {
      this.workerProcess.stdin.write(JSON.stringify(data) + "\n");
      return true;
    } catch {
      return false;
    }
  }

  private handleWorkerLine(line: string): void {
    line = line.trim();
    if (!line) return;
    try {
      const msg = JSON.parse(line);
      if (msg.type === "worker_started") {
        // Worker process is up
      } else if (msg.type === "init_ok") {
        this.status = "ready";
        this.lastError = null;
      } else if (msg.type === "init_error") {
        this.status = "error";
        this.lastError = msg.error || "Model initialization failed";
      } else if (msg.type === "predict_ok") {
        const id = msg.id;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
          const advice: DecisionAdvice = msg.advice;
          this.lastLatencyMs = advice.latencyMs;
          pending.resolve(advice);
        }
      }
    } catch {
      // Ignore unparseable lines
    }
  }

  private getFallbackAdvice(reason: string): DecisionAdvice {
    return {
      provider: "laya",
      risk: {
        label: "medium",
        confidence: 0.5,
      },
      approval: {
        recommended: true,
        confidence: 0.5,
      },
      category: null,
      routing: {},
      reasoningTags: [`fallback:${reason}`],
      latencyMs: 1,
      model: "laya-multilingual-fallback",
      advisoryOnly: true,
    };
  }

  async getAdvice(context: DecisionContext): Promise<DecisionAdvice> {
    if (this.config.provider === "disabled") {
      return new DisabledDecisionProvider(this.downloadManager).getAdvice(context);
    }

    if (this.status !== "ready" && this.status !== "loading") {
      // Offline / error -> non-blocking fallback
      return this.getFallbackAdvice("worker_unavailable");
    }

    const sanitized = sanitizeDecisionContext(context);
    const reqId = `req_${++this.reqCounter}_${Date.now()}`;

    return new Promise<DecisionAdvice>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        resolve(this.getFallbackAdvice("timeout"));
      }, this.config.workerTimeoutMs);

      this.pendingRequests.set(reqId, {
        resolve,
        reject: () => resolve(this.getFallbackAdvice("rejection")),
        timer,
      });

      const sent = this.sendToWorker({
        type: "predict",
        id: reqId,
        context: sanitized,
      });

      if (!sent) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        resolve(this.getFallbackAdvice("send_failed"));
      }
    });
  }

  getStatus(): IntelligenceStatusDto {
    return {
      provider: this.config.provider,
      status: this.status,
      model: "Laya Multilingual",
      execution: "local",
      latencyMs: this.lastLatencyMs,
      language: "Multilingual (100+ languages)",
      modelPath: this.config.modelPath,
      pythonPath: this.config.pythonPath,
      lastError: this.lastError,
    };
  }

  async updateConfig(
    config: Partial<DecisionProviderConfig>
  ): Promise<IntelligenceStatusDto> {
    if (config.provider !== undefined) {
      this.config.provider = config.provider;
    }
    if (config.modelPath !== undefined) {
      this.config.modelPath = config.modelPath;
      this.downloadManager.setTargetDir(config.modelPath);
    }
    if (config.pythonPath !== undefined) {
      this.config.pythonPath = config.pythonPath;
    }
    if (config.workerTimeoutMs !== undefined) {
      this.config.workerTimeoutMs = config.workerTimeoutMs;
    }

    if (this.config.provider === "disabled") {
      await this.shutdown();
      this.status = "disabled";
      return this.getStatus();
    }

    // Restart worker with new parameters
    await this.shutdown();
    this.isShuttingDown = false;
    this.initWorker();

    return this.getStatus();
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.workerProcess) {
      this.sendToWorker({ type: "shutdown" });
      const proc = this.workerProcess;
      this.workerProcess = null;

      // Allow 500ms graceful shutdown before SIGKILL
      await new Promise<void>((resolve) => {
        const killTimer = setTimeout(() => {
          try {
            proc.kill();
          } catch {}
          resolve();
        }, 500);

        proc.once("exit", () => {
          clearTimeout(killTimer);
          resolve();
        });
      });
    }
    this.status = "disabled";
  }
}

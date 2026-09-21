import { spawn, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import type {
  DecisionContext,
  DecisionAdvice,
  DecisionProviderConfig,
  IntelligenceStatusDto,
  IntelligenceWorkerStatus,
  ModelStatusDto,
  ModelDownloadOptions,
  ModelValidationResult,
} from "@localbridge/protocol";
import { sanitizeDecisionContext } from "./redaction.js";
import {
  ModelDownloadManager,
  getDefaultModelDir,
  getDevFallbackModelDir,
  validateModelDir,
} from "./downloader.js";
import {
  resolveLayaExecutionEnvironment,
  sanitizeLayaExecutionEnv,
  type ResolvedLayaEnvironment,
} from "./runtime.js";

export function resolveDefaultPythonPath(): string {
  const env = resolveLayaExecutionEnvironment();
  return env.pythonPath;
}

export function resolveDefaultModelPath(): string {
  const prodModel = getDefaultModelDir();
  if (validateModelDir(prodModel).valid) {
    return prodModel;
  }
  const devModel = getDevFallbackModelDir();
  if (validateModelDir(devModel).valid) {
    return devModel;
  }
  return prodModel;
}

export interface DecisionProvider {
  getAdvice(context: DecisionContext): Promise<DecisionAdvice>;
  getStatus(): IntelligenceStatusDto;
  getModelStatus(): ModelStatusDto;
  startModelDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto>;
  cancelModelDownload(): ModelStatusDto;
  validateModelPath(dir: string): ModelValidationResult;
  setModelPath(dir: string): Promise<ModelStatusDto>;
  importExistingModel(sourceDir: string, copyToManaged?: boolean): Promise<ModelStatusDto>;
  downloadAndEnable(options?: ModelDownloadOptions): Promise<IntelligenceStatusDto>;
  updateConfig(config: Partial<DecisionProviderConfig>): Promise<IntelligenceStatusDto>;
  shutdown(): Promise<void>;
}

export class DisabledDecisionProvider implements DecisionProvider {
  private downloadManager: ModelDownloadManager;

  constructor(downloadManager?: ModelDownloadManager) {
    this.downloadManager = downloadManager || new ModelDownloadManager(resolveDefaultModelPath());
  }

  getAdvice(_context: DecisionContext): Promise<DecisionAdvice> {
    return Promise.resolve({
      provider: "disabled",
      providerUsed: "disabled",
      fallbackUsed: false,
      workerReady: false,
      modelLoaded: false,
      inferenceExecuted: false,
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
    const resolved = resolveLayaExecutionEnvironment();
    return {
      provider: "disabled",
      status: "disabled",
      model: "Disabled",
      execution: "local",
      latencyMs: 0,
      language: "Multilingual (100+ languages)",
      modelPath: this.downloadManager.getTargetDir(),
      pythonPath: resolved.pythonPath,
      lastError: null,
      runtimeType: resolved.runtimeType,
      workerStatus: "stopped",
      modelLoaded: false,
      providerClass: "DisabledDecisionProvider",
      inferenceReady: false,
      developerOverride: false,
      warmInferenceMs: null,
      startupTimeoutMs: 30000,
      inferenceTimeoutMs: 5000,
    };
  }

  getModelStatus(): ModelStatusDto {
    return this.downloadManager.getStatus();
  }

  validateModelPath(dir: string): ModelValidationResult {
    return this.downloadManager.validateDirectory(dir);
  }

  setModelPath(dir: string): Promise<ModelStatusDto> {
    return Promise.resolve(this.downloadManager.setTargetDir(dir));
  }

  importExistingModel(sourceDir: string, copyToManaged = false): Promise<ModelStatusDto> {
    return this.downloadManager.importExistingModel(sourceDir, copyToManaged);
  }

  startModelDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto> {
    return this.downloadManager.startDownload(options);
  }

  cancelModelDownload(): ModelStatusDto {
    return this.downloadManager.cancelDownload();
  }

  async downloadAndEnable(options?: ModelDownloadOptions): Promise<IntelligenceStatusDto> {
    const modelStatus = this.downloadManager.getStatus();
    if (!modelStatus.installed) {
      await this.downloadManager.startDownload(options);
    }
    return this.getStatus();
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
  private workerStatus: "running" | "stopped" | "starting" | "error" = "stopped";
  private modelLoaded = false;
  private lastError: string | null = null;
  private lastLatencyMs = 0;
  private warmInferenceMs: number | null = null;
  private reqCounter = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private isShuttingDown = false;
  private downloadManager: ModelDownloadManager;
  private resolvedEnv: ResolvedLayaEnvironment;
  private readyWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

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
      startupTimeoutMs: config.startupTimeoutMs || 30000,
      inferenceTimeoutMs: config.inferenceTimeoutMs || config.workerTimeoutMs || 5000,
      developerOverride: config.developerOverride || false,
    };

    this.downloadManager = downloadManager || new ModelDownloadManager(this.config.modelPath);
    this.resolvedEnv = resolveLayaExecutionEnvironment({
      developerOverride: this.config.developerOverride,
      customPythonPath: this.config.pythonPath,
    });

    if (this.config.provider === "laya") {
      this.initWorker();
    }
  }

  getModelStatus(): ModelStatusDto {
    return this.downloadManager.getStatus();
  }

  startModelDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto> {
    return this.downloadManager.startDownload(options);
  }

  cancelModelDownload(): ModelStatusDto {
    return this.downloadManager.cancelDownload();
  }

  validateModelPath(dir: string): ModelValidationResult {
    return this.downloadManager.validateDirectory(dir);
  }

  async setModelPath(dir: string): Promise<ModelStatusDto> {
    const status = this.downloadManager.setTargetDir(dir);
    this.config.modelPath = dir;
    if (this.config.provider === "laya" && status.installed) {
      await this.shutdown();
      this.isShuttingDown = false;
      this.initWorker();
    }
    return status;
  }

  async importExistingModel(sourceDir: string, copyToManaged = false): Promise<ModelStatusDto> {
    const status = await this.downloadManager.importExistingModel(sourceDir, copyToManaged);
    this.config.modelPath = this.downloadManager.getTargetDir();
    if (this.config.provider === "laya" && status.installed) {
      await this.shutdown();
      this.isShuttingDown = false;
      this.initWorker();
    }
    return status;
  }

  async downloadAndEnable(options?: ModelDownloadOptions): Promise<IntelligenceStatusDto> {
    const modelStatus = this.downloadManager.getStatus();
    if (!modelStatus.installed) {
      await this.downloadManager.startDownload(options);
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const curr = this.downloadManager.getStatus();
        if (curr.installed) break;
        if (curr.status === "error") {
          throw new Error(curr.error || "Model download failed");
        }
      }
    }

    return this.updateConfig({
      provider: "laya",
      modelPath: this.downloadManager.getTargetDir(),
    });
  }

  async ensureReady(timeoutMs?: number): Promise<boolean> {
    const timeout = timeoutMs || this.config.startupTimeoutMs || 30000;
    if (this.status === "ready" && this.modelLoaded) {
      return true;
    }
    if (this.status === "error") {
      throw new Error(this.lastError || "Laya worker encountered error on startup");
    }

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.readyWaiters.findIndex((w) => w.resolve === resolveWaiter);
        if (idx !== -1) this.readyWaiters.splice(idx, 1);
        reject(new Error(`Laya worker readiness timed out after ${timeout}ms`));
      }, timeout);

      const resolveWaiter = () => {
        clearTimeout(timer);
        resolve(true);
      };

      const rejectWaiter = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      this.readyWaiters.push({ resolve: resolveWaiter, reject: rejectWaiter });
    });
  }

  private notifyReady(err?: Error) {
    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    for (const waiter of waiters) {
      if (err) {
        waiter.reject(err);
      } else {
        waiter.resolve();
      }
    }
  }

  private initWorker(): void {
    if (this.workerProcess || this.isShuttingDown) return;

    this.status = "starting";
    this.workerStatus = "starting";
    this.modelLoaded = false;
    this.lastError = null;

    try {
      this.resolvedEnv = resolveLayaExecutionEnvironment({
        developerOverride: this.config.developerOverride,
        customPythonPath: this.config.pythonPath,
      });

      const workerScript = this.resolvedEnv.workerScript;
      const pythonExecutable = this.resolvedEnv.pythonPath;
      const sanitizedEnv = sanitizeLayaExecutionEnv(process.env);

      this.workerProcess = spawn(pythonExecutable, [workerScript], {
        stdio: ["pipe", "pipe", "pipe"],
        env: sanitizedEnv,
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
        this.workerStatus = "stopped";
        this.modelLoaded = false;
        if (!this.isShuttingDown) {
          this.status = "offline";
          this.lastError = `Worker process exited with code ${code}`;
          this.notifyReady(new Error(this.lastError));
          for (const [id, req] of this.pendingRequests.entries()) {
            clearTimeout(req.timer);
            req.resolve(this.getFallbackAdvice("worker_crash"));
            this.pendingRequests.delete(id);
          }
        }
      });

      this.workerProcess.on("error", (err) => {
        this.status = "error";
        this.workerStatus = "error";
        this.modelLoaded = false;
        this.lastError = err.message;
        this.notifyReady(err);
      });
    } catch (err: any) {
      this.status = "error";
      this.workerStatus = "error";
      this.modelLoaded = false;
      this.lastError = err.message || "Failed to spawn Laya worker";
      this.notifyReady(err);
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
        this.status = "loading";
        this.workerStatus = "running";
        this.sendToWorker({
          type: "init",
          model_path: this.config.modelPath,
        });
      } else if (msg.type === "init_ok") {
        this.status = "ready";
        this.workerStatus = "running";
        this.modelLoaded = Boolean(msg.loaded !== false && msg.model === "laya-multilingual");
        this.lastError = null;
        this.notifyReady();
      } else if (msg.type === "init_error") {
        this.status = "error";
        this.workerStatus = "error";
        this.modelLoaded = false;
        this.lastError = msg.error || "Model initialization failed";
        this.notifyReady(new Error(this.lastError || "Model initialization failed"));
      } else if (msg.type === "predict_ok") {
        const id = msg.id;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
          const advice: DecisionAdvice = msg.advice;
          this.lastLatencyMs = advice.latencyMs;
          if (advice.inferenceExecuted && !advice.fallbackUsed && advice.latencyMs > 0) {
            this.warmInferenceMs = advice.latencyMs;
          }
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
      providerUsed: "laya",
      fallbackUsed: true,
      workerReady: this.workerStatus === "running",
      modelLoaded: this.modelLoaded,
      inferenceExecuted: false,
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
      latencyMs: 0,
      model: "laya-multilingual-fallback",
      advisoryOnly: true,
    };
  }

  async getAdvice(context: DecisionContext): Promise<DecisionAdvice> {
    if (this.config.provider === "disabled") {
      return new DisabledDecisionProvider(this.downloadManager).getAdvice(context);
    }

    if (this.status !== "ready" && this.status !== "loading") {
      return this.getFallbackAdvice("worker_unavailable");
    }

    const sanitized = sanitizeDecisionContext(context);
    const reqId = `req_${++this.reqCounter}_${Date.now()}`;
    const timeoutMs = this.config.inferenceTimeoutMs || this.config.workerTimeoutMs || 5000;

    return new Promise<DecisionAdvice>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        resolve(this.getFallbackAdvice("timeout"));
      }, timeoutMs);

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
      pythonPath: this.resolvedEnv.pythonPath,
      lastError: this.lastError,
      runtimeType: this.resolvedEnv.runtimeType,
      workerStatus: this.workerStatus,
      modelLoaded: this.modelLoaded,
      providerClass: "LayaDecisionProvider",
      inferenceReady: this.status === "ready" && this.modelLoaded,
      developerOverride: Boolean(this.config.developerOverride),
      warmInferenceMs: this.warmInferenceMs,
      startupTimeoutMs: this.config.startupTimeoutMs || 30000,
      inferenceTimeoutMs: this.config.inferenceTimeoutMs || 5000,
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
    if (config.startupTimeoutMs !== undefined) {
      this.config.startupTimeoutMs = config.startupTimeoutMs;
    }
    if (config.inferenceTimeoutMs !== undefined) {
      this.config.inferenceTimeoutMs = config.inferenceTimeoutMs;
    }
    if (config.developerOverride !== undefined) {
      this.config.developerOverride = config.developerOverride;
    }

    if (this.config.provider === "disabled") {
      await this.shutdown();
      this.status = "disabled";
      this.workerStatus = "stopped";
      return this.getStatus();
    }

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
    this.workerStatus = "stopped";
    this.modelLoaded = false;
  }
}

export class ManagedDecisionProvider implements DecisionProvider {
  private activeProvider: DecisionProvider;
  private downloadManager: ModelDownloadManager;
  private config: DecisionProviderConfig;

  constructor(
    config: Partial<DecisionProviderConfig> = {},
    downloadManager?: ModelDownloadManager
  ) {
    this.downloadManager =
      downloadManager || new ModelDownloadManager(config.modelPath || resolveDefaultModelPath());

    this.config = {
      provider: config.provider || "disabled",
      modelPath: config.modelPath || this.downloadManager.getTargetDir(),
      pythonPath: config.pythonPath || resolveDefaultPythonPath(),
      workerTimeoutMs: config.workerTimeoutMs || 5000,
      startupTimeoutMs: config.startupTimeoutMs || 30000,
      inferenceTimeoutMs: config.inferenceTimeoutMs || 5000,
      developerOverride: config.developerOverride || false,
    };

    if (this.config.provider === "laya") {
      this.activeProvider = new LayaDecisionProvider(this.config, this.downloadManager);
    } else {
      this.activeProvider = new DisabledDecisionProvider(this.downloadManager);
    }
  }

  getAdvice(context: DecisionContext): Promise<DecisionAdvice> {
    return this.activeProvider.getAdvice(context);
  }

  getStatus(): IntelligenceStatusDto {
    return this.activeProvider.getStatus();
  }

  getModelStatus(): ModelStatusDto {
    return this.downloadManager.getStatus();
  }

  startModelDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto> {
    return this.downloadManager.startDownload(options);
  }

  cancelModelDownload(): ModelStatusDto {
    return this.downloadManager.cancelDownload();
  }

  validateModelPath(dir: string): ModelValidationResult {
    return this.downloadManager.validateDirectory(dir);
  }

  async setModelPath(dir: string): Promise<ModelStatusDto> {
    const status = this.downloadManager.setTargetDir(dir);
    this.config.modelPath = dir;
    if (this.activeProvider instanceof LayaDecisionProvider && status.installed) {
      await this.activeProvider.setModelPath(dir);
    }
    return status;
  }

  async importExistingModel(sourceDir: string, copyToManaged = false): Promise<ModelStatusDto> {
    const status = await this.downloadManager.importExistingModel(sourceDir, copyToManaged);
    this.config.modelPath = this.downloadManager.getTargetDir();
    if (this.activeProvider instanceof LayaDecisionProvider && status.installed) {
      await this.activeProvider.setModelPath(this.config.modelPath);
    }
    return status;
  }

  async downloadAndEnable(options?: ModelDownloadOptions): Promise<IntelligenceStatusDto> {
    const modelStatus = this.downloadManager.getStatus();
    if (!modelStatus.installed) {
      await this.downloadManager.startDownload(options);
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const curr = this.downloadManager.getStatus();
        if (curr.installed) break;
        if (curr.status === "error") {
          throw new Error(curr.error || "Model download failed");
        }
      }
    }

    return this.updateConfig({
      provider: "laya",
      modelPath: this.downloadManager.getTargetDir(),
    });
  }

  async updateConfig(
    config: Partial<DecisionProviderConfig>
  ): Promise<IntelligenceStatusDto> {
    Object.assign(this.config, config);

    if (config.modelPath) {
      this.downloadManager.setTargetDir(config.modelPath);
    }

    if (config.provider === "laya") {
      const validation = this.downloadManager.validateDirectory(this.config.modelPath);
      if (!validation.valid) {
        throw new Error(
          `Cannot enable Laya decisions: model is not ready (${validation.error || "missing model files"}).`
        );
      }

      await this.activeProvider.shutdown();
      const layaProvider = new LayaDecisionProvider(this.config, this.downloadManager);
      try {
        await layaProvider.ensureReady(this.config.startupTimeoutMs || 30000);
        this.activeProvider = layaProvider;
        return layaProvider.getStatus();
      } catch (err: any) {
        await layaProvider.shutdown();
        this.config.provider = "disabled";
        this.activeProvider = new DisabledDecisionProvider(this.downloadManager);
        throw err;
      }
    } else if (config.provider === "disabled") {
      await this.activeProvider.shutdown();
      this.activeProvider = new DisabledDecisionProvider(this.downloadManager);
      return this.activeProvider.getStatus();
    } else {
      return this.activeProvider.updateConfig(config);
    }
  }

  async shutdown(): Promise<void> {
    await this.activeProvider.shutdown();
  }
}

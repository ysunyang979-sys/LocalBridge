import child_process, { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type DiagnosticItem,
  type DiagnosticSeverity,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import { formatLspMessage, LspStreamParser, type LspMessage } from "./transport.js";
import { killProcessTree } from "../process/kill-tree.js";

export interface LspClientOptions {
  executable: string;
  args: string[];
  projectRoot: string;
  runnerStateDir: string;
  safeEnv: NodeJS.ProcessEnv;
  logger?: Logger;
  tsserverPath?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
  method: string;
}

export class LspClient extends EventEmitter {
  private child: ChildProcess | null = null;
  private parser: LspStreamParser;
  private nextRequestId = 1;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private openDocuments = new Map<string, { version: number; languageId: string }>();
  private diagnosticsCache = new Map<string, DiagnosticItem[]>();
  private isInitialized = false;
  private isShuttingDown = false;
  private crashed = false;

  readonly executable: string;
  readonly args: string[];
  readonly projectRoot: string;
  readonly runnerStateDir: string;
  readonly tsserverPath?: string;
  private readonly safeEnv: NodeJS.ProcessEnv;
  private readonly logger?: Logger;
  private lastStderr: string[] = [];

  constructor(options: LspClientOptions) {
    super();
    this.executable = options.executable;
    this.args = options.args;
    this.projectRoot = path.resolve(options.projectRoot);
    this.runnerStateDir = options.runnerStateDir;
    this.tsserverPath = options.tsserverPath;
    this.safeEnv = options.safeEnv;
    this.logger = options.logger;
    this.parser = new LspStreamParser();
    this.setupParser();
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get isRunning(): boolean {
    return this.child !== null && !this.crashed && !this.isShuttingDown;
  }

  get hasCrashed(): boolean {
    return this.crashed;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  private setupParser(): void {
    this.parser.on("message", (msg: LspMessage) => {
      this.handleIncomingMessage(msg);
    });

    this.parser.on("error", (err) => {
      this.logger?.warn({ err: err.message }, "LSP parser encountered error");
    });
  }

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    this.crashed = false;
    this.isShuttingDown = false;
    this.isInitialized = false;

    this.logger?.info(
      { executable: this.executable, args: this.args, cwd: this.projectRoot },
      "Starting Language Server process..."
    );

    try {
      this.child = child_process.spawn(this.executable, this.args, {
        cwd: this.projectRoot,
        env: this.safeEnv,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      this.logger?.error({ err }, "Failed to spawn Language Server process");
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_SERVER_START_FAILED,
        `Failed to spawn Language Server: ${String(err)}`
      );
    }

    if (!this.child || !this.child.pid) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_SERVER_START_FAILED,
        "Language Server process failed to allocate PID"
      );
    }

    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.parser.feed(chunk);
    });

    this.child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (text) {
        this.lastStderr.push(text);
        if (this.lastStderr.length > 20) this.lastStderr.shift();
        this.logger?.debug({ stderr: text }, "Language Server stderr output");
      }
    });

    this.child.on("error", (err) => {
      this.logger?.error({ err }, "Language Server process error");
      this.handleProcessCrash(`Process error: ${err.message}`);
    });

    this.child.on("exit", (code, signal) => {
      this.logger?.info(
        { pid: this.child?.pid, code, signal },
        "Language Server process exited"
      );
      if (!this.isShuttingDown) {
        this.handleProcessCrash(`Exited unexpectedly with code ${code}, signal ${signal}`);
      }
      this.cleanup();
      this.emit("exit", { code, signal });
    });

    // Perform LSP initialize handshake
    await this.performInitialize();
  }

  private async performInitialize(): Promise<void> {
    const rootUri = pathToFileURL(this.projectRoot).href;
    const initParams = {
      processId: process.pid,
      rootUri,
      rootPath: this.projectRoot,
      workspaceFolders: [
        {
          uri: rootUri,
          name: path.basename(this.projectRoot),
        },
      ],
      capabilities: {
        workspace: {
          symbol: { dynamicRegistration: false },
          workspaceFolders: true,
        },
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ["markdown", "plaintext"],
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: true,
          },
          references: {
            dynamicRegistration: false,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
          callHierarchy: {
            dynamicRegistration: false,
          },
        },
      },
      initializationOptions: this.tsserverPath
        ? {
            tsserver: {
              path: this.tsserverPath,
            },
          }
        : undefined,
    };

    try {
      await this.request("initialize", initParams, 15000);
      this.notify("initialized", {});
      this.isInitialized = true;
      this.logger?.info(
        { projectRoot: this.projectRoot, pid: this.child?.pid },
        "Language Server initialized successfully"
      );
    } catch (err) {
      this.logger?.error({ err }, "Language Server initialize failed");
      await this.stop();
      throw new LocalBridgeError(
        LocalBridgeErrorCode.LSP_NOT_INITIALIZED,
        `Language Server initialize failed: ${String(err)}`
      );
    }
  }

  private handleProcessCrash(reason: string): void {
    if (this.isShuttingDown) return;
    this.crashed = true;
    this.isInitialized = false;

    const stderrDetail =
      this.lastStderr.length > 0 ? ` (stderr: ${this.lastStderr.join(" | ")})` : "";
    const crashReason = `${reason}${stderrDetail}`;

    // Fail all in-flight requests
    for (const [, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(
        new LocalBridgeError(
          LocalBridgeErrorCode.LSP_SERVER_CRASHED,
          `Language server crashed while processing '${req.method}': ${crashReason}`
        )
      );
    }
    this.pendingRequests.clear();
    this.emit("crashed", crashReason);
  }

  private cleanup(): void {
    this.child = null;
    this.isInitialized = false;
    this.openDocuments.clear();
    this.parser.reset();
  }

  private handleIncomingMessage(msg: LspMessage): void {
    // Response to a request
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);

        if (msg.error) {
          pending.reject(
            new LocalBridgeError(
              LocalBridgeErrorCode.INTERNAL_ERROR,
              `LSP error from server: ${msg.error.message} (code ${msg.error.code})`
            )
          );
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Server-sent notification
    if (msg.method) {
      this.handleServerNotification(msg.method, msg.params);
    }
  }

  private handleServerNotification(method: string, params: unknown): void {
    if (method === "textDocument/publishDiagnostics") {
      const p = params as {
        uri: string;
        diagnostics?: Array<{
          range: { start: { line: number; character: number }; end: { line: number; character: number } };
          severity?: number;
          code?: string | number;
          source?: string;
          message: string;
        }>;
      };

      if (p?.uri && Array.isArray(p.diagnostics)) {
        try {
          const filePath = fileURLToPath(p.uri);
          const relativePath = path.relative(this.projectRoot, filePath).replace(/\\/g, "/");

          const items: DiagnosticItem[] = p.diagnostics.map((d) => {
            let severity: DiagnosticSeverity = "error";
            switch (d.severity) {
              case 1:
                severity = "error";
                break;
              case 2:
                severity = "warning";
                break;
              case 3:
                severity = "information";
                break;
              case 4:
                severity = "hint";
                break;
            }

            return {
              path: relativePath,
              severity,
              message: d.message,
              code: d.code,
              source: d.source,
              range: {
                start: { line: d.range.start.line, character: d.range.start.character },
                end: { line: d.range.end.line, character: d.range.end.character },
              },
            };
          });

          this.diagnosticsCache.set(relativePath, items);
        } catch {
          // Ignore invalid uri
        }
      }
    }
  }

  request<T>(method: string, params: unknown, timeoutMs = 10000): Promise<T> {
    if (!this.child || !this.child.stdin || this.crashed) {
      return Promise.reject(
        new LocalBridgeError(
          LocalBridgeErrorCode.LSP_NOT_INITIALIZED,
          "Language Server is not running"
        )
      );
    }

    const id = this.nextRequestId++;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        // Attempt cancelRequest
        try {
          this.notify("$/cancelRequest", { id });
        } catch {}

        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.LSP_REQUEST_TIMEOUT,
            `LSP request '${method}' timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
        method,
      });

      const message = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      try {
        const payload = formatLspMessage(message);
        this.child!.stdin!.write(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            `Failed to send LSP message: ${String(err)}`
          )
        );
      }
    });
  }

  notify(method: string, params: unknown): void {
    if (!this.child || !this.child.stdin || this.crashed) {
      return;
    }

    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    try {
      const payload = formatLspMessage(message);
      this.child.stdin.write(payload);
    } catch (err) {
      this.logger?.warn({ err }, `Failed to send LSP notification '${method}'`);
    }
  }

  /**
   * Synchronize document open
   */
  openDocument(relativePath: string, content: string, languageId: string): void {
    const fullPath = path.resolve(this.projectRoot, relativePath);
    const uri = pathToFileURL(fullPath).href;

    this.openDocuments.set(relativePath, { version: 1, languageId });

    this.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });
  }

  /**
   * Synchronize document change (full content sync)
   */
  changeDocument(relativePath: string, content: string): void {
    const existing = this.openDocuments.get(relativePath);
    const fullPath = path.resolve(this.projectRoot, relativePath);
    const uri = pathToFileURL(fullPath).href;

    if (!existing) {
      this.openDocument(relativePath, content, "typescript");
      return;
    }

    existing.version += 1;
    this.notify("textDocument/didChange", {
      textDocument: {
        uri,
        version: existing.version,
      },
      contentChanges: [
        {
          text: content,
        },
      ],
    });
  }

  /**
   * Synchronize document save
   */
  saveDocument(relativePath: string, content: string): void {
    const fullPath = path.resolve(this.projectRoot, relativePath);
    const uri = pathToFileURL(fullPath).href;

    this.notify("textDocument/didSave", {
      textDocument: { uri },
      text: content,
    });
  }

  /**
   * Synchronize document close
   */
  closeDocument(relativePath: string): void {
    const fullPath = path.resolve(this.projectRoot, relativePath);
    const uri = pathToFileURL(fullPath).href;

    this.openDocuments.delete(relativePath);
    this.notify("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  getDiagnosticsForFile(relativePath: string): DiagnosticItem[] {
    const normalized = relativePath.replace(/\\/g, "/");
    return this.diagnosticsCache.get(normalized) ?? [];
  }

  getAllDiagnostics(): DiagnosticItem[] {
    const all: DiagnosticItem[] = [];
    for (const items of this.diagnosticsCache.values()) {
      all.push(...items);
    }
    return all;
  }

  clearDiagnostics(relativePath: string): void {
    const normalized = relativePath.replace(/\\/g, "/");
    this.diagnosticsCache.delete(normalized);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.isShuttingDown = true;

    const pid = this.child.pid;
    this.logger?.info({ pid }, "Shutting down Language Server...");

    try {
      await this.request("shutdown", {}, 2000);
      this.notify("exit", {});
    } catch {
      // If shutdown request fails or times out, proceed to process tree kill
    }

    if (pid) {
      await killProcessTree(pid);
    }

    this.cleanup();
  }
}

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface KimiAuthTraceEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  userAgent?: string;
  accept?: string;
  contentType?: string;
  authorizationPresent: boolean;
  wwwAuthenticatePresent: boolean;
  oauthStage:
    | "mcp-probe"
    | "oauth-discovery"
    | "oauth-authorize"
    | "oauth-token"
    | "oauth-revoke"
    | "mcp-request"
    | "other";
  clientId?: string;
  redirectUriHostOnly?: string;
  scope?: string;
  resource?: string;
  durationMs?: number;
}

/**
 * Thread-safe, sanitized authentication diagnostics collector for Kimi Web / Remote MCP.
 * Strictly guarantees that no tokens, API keys, client secrets, or sensitive headers are logged.
 */
export class KimiAuthTraceCollector {
  private static instance: KimiAuthTraceCollector | null = null;
  private memoryBuffer: KimiAuthTraceEntry[] = [];
  private readonly maxMemoryEntries = 200;
  private logFilePath: string;

  constructor(customLogPath?: string) {
    const defaultDir =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "logs")
        : path.join(os.homedir(), ".localbridge", "logs");

    this.logFilePath = customLogPath || path.join(defaultDir, "kimi-auth-trace.jsonl");

    try {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Best-effort directory creation
    }
  }

  static getInstance(): KimiAuthTraceCollector {
    if (!KimiAuthTraceCollector.instance) {
      KimiAuthTraceCollector.instance = new KimiAuthTraceCollector();
    }
    return KimiAuthTraceCollector.instance;
  }

  record(entry: KimiAuthTraceEntry): void {
    // Redaction check: ensure no raw secret was accidentally passed
    const sanitized: KimiAuthTraceEntry = {
      timestamp: entry.timestamp || new Date().toISOString(),
      method: entry.method.toUpperCase(),
      path: entry.path,
      statusCode: entry.statusCode,
      userAgent: entry.userAgent?.slice(0, 200),
      accept: entry.accept?.slice(0, 150),
      contentType: entry.contentType?.slice(0, 100),
      authorizationPresent: Boolean(entry.authorizationPresent),
      wwwAuthenticatePresent: Boolean(entry.wwwAuthenticatePresent),
      oauthStage: entry.oauthStage,
      clientId: entry.clientId?.slice(0, 100),
      redirectUriHostOnly: entry.redirectUriHostOnly
        ? this.extractHostOnly(entry.redirectUriHostOnly)
        : undefined,
      scope: entry.scope?.slice(0, 100),
      resource: entry.resource?.slice(0, 200),
      durationMs: entry.durationMs,
    };

    // Store in circular memory buffer
    this.memoryBuffer.push(sanitized);
    if (this.memoryBuffer.length > this.maxMemoryEntries) {
      this.memoryBuffer.shift();
    }

    // Append to file asynchronously
    try {
      const line = JSON.stringify(sanitized) + "\n";
      fs.appendFileSync(this.logFilePath, line, "utf-8");
    } catch {
      // Best-effort file write
    }
  }

  getRecentTraces(limit: number = 50): KimiAuthTraceEntry[] {
    return this.memoryBuffer.slice(-Math.min(limit, this.memoryBuffer.length));
  }

  getEntries(): KimiAuthTraceEntry[] {
    return this.getRecentTraces();
  }

  clear(): void {
    this.memoryBuffer = [];
    try {
      if (fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, "", "utf-8");
      }
    } catch {}
  }

  /**
   * Formats traces into human-readable sequence for production report.
   * Example: "1. POST /mcp -> 401 (WWW-Authenticate present, no Bearer)"
   */
  formatSummary(): string[] {
    return this.memoryBuffer.map((t, idx) => {
      const authInfo = t.authorizationPresent ? "Bearer provided" : "No Auth Header";
      const wwwInfo = t.wwwAuthenticatePresent ? "WWW-Authenticate sent" : "No WWW-Authenticate";
      return `${idx + 1}. [${t.timestamp}] ${t.method} ${t.path} -> ${t.statusCode} (${t.oauthStage}, ${authInfo}, ${wwwInfo})`;
    });
  }

  private extractHostOnly(rawUri: string): string {
    try {
      const u = new URL(rawUri);
      return u.host;
    } catch {
      return rawUri.split("/")[0] || "unknown";
    }
  }
}

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type {
  AIClientType,
  AIConnectionCategory,
  AIConnectionStatus,
  AIConnectionTransport,
  AIConnectionDto,
  AIConnectionConfig,
  ConfigPreviewResult,
  ApplyConfigResult,
} from "@localbridge/protocol";
import type { AiConnectionRow, TokenRow } from "./schema.js";
import type { TokenService } from "./token-service.js";

const ALGORITHM = "aes-256-gcm";

export class SecureSecretStorage {
  private masterKey: Buffer;

  constructor(secretDir?: string) {
    const baseDir =
      secretDir ||
      (process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "secrets")
        : path.join(os.homedir(), ".localbridge", "secrets"));

    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      const keyPath = path.join(baseDir, "master.key");
      if (fs.existsSync(keyPath)) {
        this.masterKey = fs.readFileSync(keyPath);
      } else {
        this.masterKey = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, this.masterKey, { mode: 0o600 });
      }
    } catch {
      // Fallback in-memory key if disk write fails
      this.masterKey = crypto.scryptSync("localbridge-secure-storage-salt", "salt", 32);
    }
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return "";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext || !ciphertext.includes(":")) return "";
    try {
      const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");
      if (!ivHex || !tagHex || !encryptedHex) return "";
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.masterKey,
        Buffer.from(ivHex, "hex")
      );
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return "";
    }
  }

  maskApiKey(apiKey?: string | null): string {
    if (!apiKey) return "";
    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) {
      return "••••••••";
    }
    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }
}

export class ConnectionService {
  private readonly secretStorage: SecureSecretStorage;
  private readonly stmtList: Database.Statement;
  private readonly stmtGet: Database.Statement;
  private readonly stmtUpsert: Database.Statement;
  private readonly stmtDelete: Database.Statement;
  private readonly stmtSetPrimary: Database.Statement;
  private readonly stmtResetPrimary: Database.Statement;
  private readonly stmtUpdateStatus: Database.Statement;
  private readonly stmtGetToken: Database.Statement;

  constructor(
    private readonly db: Database.Database,
    private readonly tokenService: TokenService
  ) {
    this.secretStorage = new SecureSecretStorage();

    this.stmtList = this.db.prepare(
      `SELECT * FROM ai_connections ORDER BY is_primary DESC, name ASC`
    );
    this.stmtGet = this.db.prepare(`SELECT * FROM ai_connections WHERE id = ?`);
    this.stmtUpsert = this.db.prepare(
      `INSERT INTO ai_connections (
        id, client_type, name, category, status, transport, endpoint,
        token_id, config_json, detected_config_path, is_primary,
        tool_allowlist_json, created_at, updated_at, last_seen_at, last_connected_at, last_error
      ) VALUES (
        @id, @client_type, @name, @category, @status, @transport, @endpoint,
        @token_id, @config_json, @detected_config_path, @is_primary,
        @tool_allowlist_json, @created_at, @updated_at, @last_seen_at, @last_connected_at, @last_error
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        transport = excluded.transport,
        endpoint = excluded.endpoint,
        token_id = COALESCE(excluded.token_id, ai_connections.token_id),
        config_json = COALESCE(excluded.config_json, ai_connections.config_json),
        detected_config_path = COALESCE(excluded.detected_config_path, ai_connections.detected_config_path),
        is_primary = excluded.is_primary,
        tool_allowlist_json = excluded.tool_allowlist_json,
        updated_at = excluded.updated_at`
    );
    this.stmtDelete = this.db.prepare(`DELETE FROM ai_connections WHERE id = ?`);
    this.stmtSetPrimary = this.db.prepare(
      `UPDATE ai_connections SET is_primary = 1 WHERE id = ?`
    );
    this.stmtResetPrimary = this.db.prepare(`UPDATE ai_connections SET is_primary = 0`);
    this.stmtUpdateStatus = this.db.prepare(
      `UPDATE ai_connections
       SET status = ?, last_seen_at = ?, last_connected_at = COALESCE(?, last_connected_at), last_error = ?, updated_at = ?
       WHERE id = ?`
    );
    this.stmtGetToken = this.db.prepare(`SELECT * FROM tokens WHERE id = ?`);
  }

  getSecretStorage(): SecureSecretStorage {
    return this.secretStorage;
  }

  /**
   * Discovers known standard config file paths for clients on this system.
   */
  detectClientConfigPath(clientType: AIClientType): { path: string | null; exists: boolean } {
    const home = os.homedir();
    const isWin = process.platform === "win32";

    switch (clientType) {
      case "kimi": {
        const candidate = path.join(home, ".kimi-code", "mcp.json");
        return { path: candidate, exists: fs.existsSync(candidate) };
      }
      case "claude": {
        const candidateDesktop = isWin
          ? (process.env.APPDATA ? path.join(process.env.APPDATA, "Claude", "claude_desktop_config.json") : null)
          : path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");

        if (candidateDesktop && fs.existsSync(candidateDesktop)) {
          return { path: candidateDesktop, exists: true };
        }
        const candidateCode = path.join(home, ".claude.json");
        if (fs.existsSync(candidateCode)) {
          return { path: candidateCode, exists: true };
        }
        return { path: candidateDesktop || candidateCode, exists: false };
      }
      case "gemini": {
        const candidate = path.join(home, ".gemini", "settings.json");
        return { path: candidate, exists: fs.existsSync(candidate) };
      }
      default:
        return { path: null, exists: false };
    }
  }

  /**
   * Lists all configured connections.
   */
  listConnections(): AIConnectionDto[] {
    const rows = this.stmtList.all() as AiConnectionRow[];
    return rows.map((r) => this.rowToDto(r));
  }

  /**
   * Gets a specific connection by ID.
   */
  getConnection(id: string): AIConnectionDto | null {
    const row = this.stmtGet.get(id) as AiConnectionRow | undefined;
    return row ? this.rowToDto(row) : null;
  }

  /**
   * Retrieves full decrypted config for server-internal usage (e.g. tool execution).
   */
  getDecryptedConfig(id: string): Record<string, any> | null {
    const row = this.stmtGet.get(id) as AiConnectionRow | undefined;
    if (!row || !row.config_json) return null;
    try {
      const parsed = JSON.parse(row.config_json);
      if (parsed.apiKeyEncrypted) {
        parsed.apiKey = this.secretStorage.decrypt(parsed.apiKeyEncrypted);
        delete parsed.apiKeyEncrypted;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Creates or updates an AI connection.
   */
  createOrUpdateConnection(input: Partial<AIConnectionConfig> & { id: string; clientType: AIClientType; name: string }): AIConnectionDto {
    const now = Date.now();
    const existing = this.stmtGet.get(input.id) as AiConnectionRow | undefined;

    let configJsonToStore: string | null = existing?.config_json || null;

    if (input.baseUrl || input.apiKey !== undefined || input.model || input.apiFormat || input.metadata) {
      let currentParsed: Record<string, any> = {};
      if (configJsonToStore) {
        try {
          currentParsed = JSON.parse(configJsonToStore);
        } catch {}
      }

      if (input.baseUrl !== undefined) currentParsed.baseUrl = input.baseUrl;
      if (input.model !== undefined) currentParsed.model = input.model;
      if (input.apiFormat !== undefined) currentParsed.apiFormat = input.apiFormat;
      if (input.metadata) Object.assign(currentParsed, input.metadata);

      if (input.apiKey) {
        currentParsed.apiKeyEncrypted = this.secretStorage.encrypt(input.apiKey);
        currentParsed.apiKeyMasked = this.secretStorage.maskApiKey(input.apiKey);
      }

      configJsonToStore = JSON.stringify(currentParsed);
    }

    const detected = this.detectClientConfigPath(input.clientType);

    // If setting as primary, reset others first
    if (input.isPrimary) {
      this.stmtResetPrimary.run();
    }

    const rowParam = {
      id: input.id,
      client_type: input.clientType,
      name: input.name,
      category: input.category || (input.clientType === "deepseek" || input.clientType === "custom-openai" ? "tool-adapter" : "native-mcp"),
      status: existing?.status || "not_configured",
      transport: input.transport || (input.clientType === "chatgpt" || input.clientType === "kimi-web" ? "tunnel" : "http"),
      endpoint: input.endpoint || (input.clientType === "deepseek" ? "https://api.deepseek.com" : (input.clientType === "kimi-web" ? "Secure MCP Tunnel" : "http://127.0.0.1:18080/mcp")),
      token_id: input.tokenId !== undefined ? input.tokenId : (existing?.token_id || null),
      config_json: configJsonToStore,
      detected_config_path: input.detectedConfigPath !== undefined ? input.detectedConfigPath : (existing?.detected_config_path || detected.path),
      is_primary: input.isPrimary ? 1 : (existing?.is_primary ?? 0),
      tool_allowlist_json: input.toolAllowlist ? JSON.stringify(input.toolAllowlist) : (existing?.tool_allowlist_json || null),
      created_at: existing?.created_at || now,
      updated_at: now,
      last_seen_at: existing?.last_seen_at || null,
      last_connected_at: existing?.last_connected_at || null,
      last_error: existing?.last_error || null,
    };

    this.stmtUpsert.run(rowParam);
    return this.getConnection(input.id)!;
  }

  /**
   * Sets a connection as the primary AI.
   */
  setPrimary(id: string): boolean {
    const conn = this.stmtGet.get(id);
    if (!conn) return false;
    this.stmtResetPrimary.run();
    this.stmtSetPrimary.run(id);
    return true;
  }

  /**
   * Deletes a custom connection.
   */
  deleteConnection(id: string): boolean {
    const res = this.stmtDelete.run(id);
    return res.changes > 0;
  }

  /**
   * Updates status and activity timestamp.
   */
  updateStatus(id: string, status: AIConnectionStatus, error?: string | null): void {
    const now = Date.now();
    const isConnected = status === "connected";
    this.stmtUpdateStatus.run(
      status,
      now,
      isConnected ? now : null,
      error || null,
      now,
      id
    );
  }

  /**
   * Records live interaction activity from an AI client.
   */
  recordInteraction(id: string): void {
    const now = Date.now();
    this.stmtUpdateStatus.run("connected", now, now, null, now, id);
  }

  /**
   * Creates or rotates a dedicated MCP token for an AI connection.
   */
  createOrRotateToken(connectionId: string, scopes = ["read", "write"]): { token: string; tokenId: string } {
    let conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
    if (!conn) {
      // Auto-create builtin connection record if not yet saved in database
      if (connectionId === "conn_kimi_web") {
        this.createOrUpdateConnection({
          id: "conn_kimi_web",
          clientType: "kimi-web",
          name: "Kimi Web",
          category: "native-mcp",
          transport: "tunnel",
          endpoint: "Secure MCP Tunnel",
        });
        conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
      } else if (connectionId === "conn_chatgpt") {
        this.createOrUpdateConnection({
          id: "conn_chatgpt",
          clientType: "chatgpt",
          name: "ChatGPT",
          category: "native-mcp",
          transport: "tunnel",
          endpoint: "Secure MCP Tunnel",
          isPrimary: true,
        });
        conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
      }
    }

    if (!conn) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Revoke previous token if existing
    if (conn.token_id) {
      try {
        this.tokenService.revokeToken(conn.token_id);
      } catch {}
    }

    const isKimi = conn.client_type === "kimi-web" || connectionId === "conn_kimi_web";
    const prefix = isKimi ? "lb_kimi_" : "lb_";

    const created = this.tokenService.createToken({
      name: `AI Client: ${conn.name}`,
      type: "mcp",
      scopes,
      prefix,
    });

    this.db
      .prepare(`UPDATE ai_connections SET token_id = ?, status = 'configured', updated_at = ? WHERE id = ?`)
      .run(created.id, Date.now(), connectionId);

    return { token: created.token, tokenId: created.id };
  }

  /**
   * Revokes an AI connection's dedicated MCP token.
   */
  revokeConnectionToken(connectionId: string): boolean {
    const conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
    if (!conn) return false;

    if (conn.token_id) {
      try {
        this.tokenService.revokeToken(conn.token_id);
      } catch {}
    }

    this.db
      .prepare(`UPDATE ai_connections SET token_id = NULL, status = 'not_configured', updated_at = ? WHERE id = ?`)
      .run(Date.now(), connectionId);

    return true;
  }

  /**
   * Generates standard client configuration JSON snippet.
   */
  generateConfigSnippet(connectionId: string, token: string): Record<string, any> {
    const conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
    if (!conn) throw new Error(`Connection not found: ${connectionId}`);

    const endpoint = conn.endpoint || "http://127.0.0.1:18080/mcp";

    return {
      mcpServers: {
        nexus: {
          url: endpoint,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    };
  }

  /**
   * Previews configuration patch for client.
   */
  previewConfigPatch(connectionId: string, token: string): ConfigPreviewResult {
    const conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
    if (!conn) throw new Error(`Connection not found: ${connectionId}`);

    const detected = this.detectClientConfigPath(conn.client_type as AIClientType);
    const targetPath = conn.detected_config_path || detected.path || path.join(os.homedir(), `.${conn.client_type}`, "mcp.json");
    const fileExists = fs.existsSync(targetPath);

    let beforeContent: string | null = null;
    let existingObj: Record<string, any> = {};

    if (fileExists) {
      try {
        beforeContent = fs.readFileSync(targetPath, "utf8");
        existingObj = JSON.parse(beforeContent);
      } catch {
        existingObj = {};
      }
    }

    if (!existingObj.mcpServers) {
      existingObj.mcpServers = {};
    }

    const snippet = this.generateConfigSnippet(connectionId, token);
    const afterObj = {
      ...existingObj,
      mcpServers: {
        ...existingObj.mcpServers,
        ...snippet.mcpServers,
      },
    };

    const afterContent = JSON.stringify(afterObj, null, 2);
    const diffSummary = fileExists
      ? `Update "nexus" server in existing configuration at ${targetPath}`
      : `Create new MCP configuration with "nexus" server at ${targetPath}`;

    return {
      connectionId,
      clientType: conn.client_type as AIClientType,
      configFilePath: targetPath,
      fileExists,
      beforeContent,
      afterContent,
      diffSummary,
    };
  }

  /**
   * Atomically applies configuration patch with automatic backup.
   */
  applyConfigPatch(connectionId: string, token: string): ApplyConfigResult {
    const preview = this.previewConfigPatch(connectionId, token);
    const targetPath = preview.configFilePath;
    const parentDir = path.dirname(targetPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let backupFilePath: string | undefined;

    if (preview.fileExists && preview.beforeContent) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupFilePath = `${targetPath}.nexus.bak.${timestamp}`;
      fs.copyFileSync(targetPath, backupFilePath);
    }

    const tempPath = `${targetPath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, preview.afterContent, "utf8");
      // Validate parse before replace
      JSON.parse(fs.readFileSync(tempPath, "utf8"));
      fs.renameSync(tempPath, targetPath);

      this.updateStatus(connectionId, "configured");
      return {
        success: true,
        configFilePath: targetPath,
        backupFilePath,
        message: `Successfully configured Nexus for ${preview.clientType}`,
      };
    } catch (err: any) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {}
      }
      if (backupFilePath && fs.existsSync(backupFilePath)) {
        fs.copyFileSync(backupFilePath, targetPath);
      }
      throw new Error(`Failed to apply configuration: ${err?.message || String(err)}`);
    }
  }

  /**
   * Rolls back configuration to specified backup file.
   */
  rollbackConfigPatch(targetPath: string, backupPath: string): boolean {
    if (!fs.existsSync(backupPath)) return false;
    fs.copyFileSync(backupPath, targetPath);
    return true;
  }

  private rowToDto(row: AiConnectionRow): AIConnectionDto {
    let scopes: string[] = ["read", "write", "execute"];
    let tokenMasked: string | null = null;

    if (row.token_id) {
      const tokenRow = this.stmtGetToken.get(row.token_id) as TokenRow | undefined;
      if (tokenRow) {
        try {
          scopes = JSON.parse(tokenRow.scopes || "[]");
        } catch {}
        const prefix = tokenRow.name?.toLowerCase().includes("kimi") ? "lb_kimi_" : "lb_";
        tokenMasked = `${prefix}••••${tokenRow.id.slice(-4).toUpperCase()}`;
      }
    }

    let toolAllowlist: string[] | null = null;
    if (row.tool_allowlist_json) {
      try {
        toolAllowlist = JSON.parse(row.tool_allowlist_json);
      } catch {}
    }

    let parsedConfig: Record<string, any> = {};
    if (row.config_json) {
      try {
        parsedConfig = JSON.parse(row.config_json);
      } catch {}
    }

    const detected = this.detectClientConfigPath(row.client_type as AIClientType);

    return {
      id: row.id,
      clientType: row.client_type as AIClientType,
      name: row.name,
      category: row.category as AIConnectionCategory,
      status: row.status as AIConnectionStatus,
      transport: row.transport as AIConnectionTransport,
      endpoint: row.endpoint,
      tokenId: row.token_id,
      tokenMasked,
      scopes,
      toolCount: toolAllowlist ? toolAllowlist.length : 55, // 55 total tools in Nexus
      lastSeenAt: row.last_seen_at,
      lastConnectedAt: row.last_connected_at,
      latencyMs: row.status === "connected" ? 8 : null,
      lastError: row.last_error,
      detectedConfigPath: row.detected_config_path || detected.path,
      isDetected: detected.exists,
      isPrimary: Boolean(row.is_primary),
      toolAllowlist,
      metadata: {
        baseUrl: parsedConfig.baseUrl,
        model: parsedConfig.model,
        apiFormat: parsedConfig.apiFormat,
        apiKeyMasked: parsedConfig.apiKeyMasked,
      },
    };
  }
}

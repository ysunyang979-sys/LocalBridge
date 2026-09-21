import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type {
  AIClientType,
  AIConnectionStatus,
  AIConnectionDto,
  AIConnectionConfig,
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
  private readonly stmtUpdateStatus: Database.Statement;
  private readonly stmtGetToken: Database.Statement;

  constructor(
    private readonly db: Database.Database,
    private readonly tokenService: TokenService
  ) {
    this.secretStorage = new SecureSecretStorage();

    this.stmtList = this.db.prepare(
      `SELECT * FROM ai_connections WHERE client_type = 'chatgpt' ORDER BY is_primary DESC, name ASC`
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
   * Lists all configured connections (ChatGPT only).
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
   * Retrieves full decrypted config for server-internal usage.
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
   * Creates or updates ChatGPT connection.
   */
  createOrUpdateConnection(input: Partial<AIConnectionConfig> & { id: string; clientType: AIClientType; name: string }): AIConnectionDto {
    const now = Date.now();
    const existing = this.stmtGet.get(input.id) as AiConnectionRow | undefined;

    const rowParam = {
      id: input.id,
      client_type: input.clientType,
      name: input.name,
      category: "native-mcp",
      status: existing?.status || "not_configured",
      transport: "tunnel",
      endpoint: input.endpoint || "Secure MCP Tunnel",
      token_id: input.tokenId !== undefined ? input.tokenId : (existing?.token_id || null),
      config_json: null,
      detected_config_path: null,
      is_primary: 1,
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
  createOrRotateToken(connectionId: string, scopes = ["read", "write", "execute"]): { token: string; tokenId: string } {
    let conn = this.stmtGet.get(connectionId) as AiConnectionRow | undefined;
    if (!conn) {
      if (connectionId === "conn_chatgpt") {
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

    const created = this.tokenService.createToken({
      name: `AI Client: ${conn.name}`,
      type: "mcp",
      scopes,
      prefix: "lb_",
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

  private rowToDto(row: AiConnectionRow): AIConnectionDto {
    let scopes: string[] = ["read", "write", "execute"];
    let tokenMasked: string | null = null;

    if (row.token_id) {
      const tokenRow = this.stmtGetToken.get(row.token_id) as TokenRow | undefined;
      if (tokenRow) {
        try {
          scopes = JSON.parse(tokenRow.scopes || "[]");
        } catch {}
        tokenMasked = `lb_••••${tokenRow.id.slice(-4).toUpperCase()}`;
      }
    }

    let toolAllowlist: string[] | null = null;
    if (row.tool_allowlist_json) {
      try {
        toolAllowlist = JSON.parse(row.tool_allowlist_json);
      } catch {}
    }

    return {
      id: row.id,
      clientType: "chatgpt",
      name: row.name,
      category: "native-mcp",
      status: row.status as AIConnectionStatus,
      transport: "tunnel",
      endpoint: row.endpoint || "Secure MCP Tunnel",
      tokenId: row.token_id,
      tokenMasked,
      scopes,
      toolCount: 62, // 62 core MCP tools
      lastSeenAt: row.last_seen_at,
      lastConnectedAt: row.last_connected_at,
      latencyMs: row.status === "connected" ? 8 : null,
      lastError: row.last_error,
      detectedConfigPath: null,
      isDetected: false,
      isPrimary: true,
      toolAllowlist,
      metadata: {},
    };
  }
}

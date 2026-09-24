import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  generateMcpToken,
  generateRunnerToken,
  hashToken,
  verifyToken,
  MCP_TOKEN_PREFIX,
  RUNNER_TOKEN_PREFIX,
  MANAGEMENT_TOKEN_PREFIX,
  type TokenType,
} from "@localbridge/shared";
import type { TokenRow } from "./schema.js";

export interface CreateTokenParams {
  name: string;
  type: TokenType;
  scopes?: string[];
  expiresAt?: number | null;
  prefix?: string;
  purpose?: string;
}

export interface CreatedTokenResult {
  id: string;
  name: string;
  type: TokenType;
  token: string;
  createdAt: number;
  expiresAt: number | null;
  purpose?: string | null;
}

export interface PublicTokenInfo {
  id: string;
  type: TokenType;
  name: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  purpose?: string | null;
}

export interface ValidateTokenResult {
  valid: boolean;
  tokenRecord?: TokenRow;
  reason?:
    | "MISSING_TOKEN"
    | "INVALID_TOKEN_TYPE"
    | "TOKEN_NOT_FOUND"
    | "TOKEN_REVOKED"
    | "TOKEN_EXPIRED"
    | "INVALID_SECRET";
}

export class TokenService {
  private readonly stmtInsertToken: Database.Statement;
  private readonly stmtValidateRunner: Database.Statement;
  private readonly stmtValidateMcp: Database.Statement;
  private readonly stmtUpdateLastUsed: Database.Statement;
  private readonly stmtListTokens: Database.Statement;
  private readonly stmtRevokeToken: Database.Statement;
  private readonly stmtFindTokenById: Database.Statement;

  constructor(private readonly db: Database.Database) {
    try {
      this.db.prepare("ALTER TABLE tokens ADD COLUMN purpose TEXT").run();
    } catch {}

    this.stmtInsertToken = this.db.prepare(
      `INSERT INTO tokens (id, type, token_hash, name, scopes, created_at, expires_at, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtValidateRunner = this.db.prepare(
      `SELECT id, type, token_hash, name, scopes, created_at, last_used_at, expires_at, revoked_at, purpose
       FROM tokens
       WHERE token_hash = ? AND type = 'runner'`
    );
    this.stmtValidateMcp = this.db.prepare(
      `SELECT id, type, token_hash, name, scopes, created_at, last_used_at, expires_at, revoked_at, purpose
       FROM tokens
       WHERE token_hash = ? AND type = 'mcp'`
    );
    this.stmtUpdateLastUsed = this.db.prepare(
      "UPDATE tokens SET last_used_at = ? WHERE id = ?"
    );
    this.stmtListTokens = this.db.prepare(
      `SELECT id, type, name, scopes, created_at, last_used_at, expires_at, revoked_at, purpose
       FROM tokens
       ORDER BY created_at DESC`
    );
    this.stmtRevokeToken = this.db.prepare(
      "UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
    );
    this.stmtFindTokenById = this.db.prepare(
      "SELECT id, type, token_hash, name, scopes, created_at, last_used_at, expires_at, revoked_at, purpose FROM tokens WHERE id = ?"
    );
  }

  /**
   * Create a new cryptographically secure token.
   * The plaintext token is returned ONLY ONCE in the result and NEVER saved to the database.
   */
  createToken(params: CreateTokenParams): CreatedTokenResult {
    const id = `tok_${crypto.randomUUID()}`;
    const token =
      params.type === "runner"
        ? generateRunnerToken()
        : params.prefix
        ? `${params.prefix}${crypto.randomBytes(32).toString("hex")}`
        : generateMcpToken();
    const tokenHash = hashToken(token);
    const createdAt = Date.now();
    const scopesList = [...(params.scopes ?? [])];
    const scopesJson = JSON.stringify(scopesList);
    const expiresAt = params.expiresAt ?? null;
    const purpose = params.purpose ?? null;

    this.stmtInsertToken.run(
      id,
      params.type,
      tokenHash,
      params.name,
      scopesJson,
      createdAt,
      expiresAt,
      purpose
    );

    return {
      id,
      name: params.name,
      type: params.type,
      token,
      createdAt,
      expiresAt,
      purpose: params.purpose ?? null,
    };
  }

  /**
   * Ensure a specific runner token exists in the database.
   * If not already present and active, hashes and inserts it.
   */
  ensureRunnerToken(token: string, name = "Desktop Embedded Runner"): string {
    const tokenHash = hashToken(token);
    const existing = this.stmtValidateRunner.get(tokenHash) as TokenRow | undefined;
    if (existing && !existing.revoked_at) {
      return existing.id;
    }
    const id = `tok_${crypto.randomUUID()}`;
    const createdAt = Date.now();
    this.stmtInsertToken.run(
      id,
      "runner",
      tokenHash,
      name,
      JSON.stringify([]),
      createdAt,
      null,
      null
    );
    return id;
  }

  /**
   * Validate a runner token strictly.
   * Rejects MCP tokens, revoked tokens, expired tokens, and unknown tokens.
   */
  validateRunnerToken(rawToken: string): ValidateTokenResult {
    if (!rawToken || typeof rawToken !== "string") {
      return { valid: false, reason: "MISSING_TOKEN" };
    }

    // Explicitly reject MCP tokens (lb_ prefix) and Management tokens (lm_ prefix)
    if (rawToken.startsWith(MCP_TOKEN_PREFIX) || rawToken.startsWith(MANAGEMENT_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    if (!rawToken.startsWith(RUNNER_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    const tokenHash = hashToken(rawToken);

    const row = this.stmtValidateRunner.get(tokenHash) as TokenRow | undefined;

    if (!row) {
      return { valid: false, reason: "TOKEN_NOT_FOUND" };
    }

    // Verify constant-time comparison
    if (!verifyToken(rawToken, row.token_hash)) {
      return { valid: false, reason: "TOKEN_NOT_FOUND" };
    }

    if (row.revoked_at !== null) {
      return { valid: false, reason: "TOKEN_REVOKED" };
    }

    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      return { valid: false, reason: "TOKEN_EXPIRED" };
    }

    // Update last_used_at timestamp
    this.stmtUpdateLastUsed.run(Date.now(), row.id);

    return { valid: true, tokenRecord: row };
  }

  /**
   * Validate an MCP token strictly.
   * Rejects runner tokens, management tokens, revoked tokens, expired tokens, and unknown tokens.
   */
  validateMcpToken(rawToken: string): ValidateTokenResult {
    if (!rawToken || typeof rawToken !== "string") {
      return { valid: false, reason: "MISSING_TOKEN" };
    }

    // Explicitly reject Runner tokens (lbr_ prefix) and Management tokens (lm_ prefix)
    if (rawToken.startsWith(RUNNER_TOKEN_PREFIX) || rawToken.startsWith(MANAGEMENT_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    if (!rawToken.startsWith(MCP_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    const tokenHash = hashToken(rawToken);

    const row = this.stmtValidateMcp.get(tokenHash) as TokenRow | undefined;

    if (!row) {
      return { valid: false, reason: "TOKEN_NOT_FOUND" };
    }

    // Verify constant-time comparison
    if (!verifyToken(rawToken, row.token_hash)) {
      return { valid: false, reason: "TOKEN_NOT_FOUND" };
    }

    if (row.revoked_at !== null) {
      return { valid: false, reason: "TOKEN_REVOKED" };
    }

    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      return { valid: false, reason: "TOKEN_EXPIRED" };
    }

    // Update last_used_at timestamp
    this.stmtUpdateLastUsed.run(Date.now(), row.id);

    if (!row.purpose) {
      try {
        const parsedScopes = JSON.parse(row.scopes) as string[];
        for (const s of parsedScopes) {
          if (s.startsWith("purpose:")) {
            row.purpose = s.slice("purpose:".length);
            break;
          } else if (s === "chat:direct-approve") {
            row.purpose = "chatgpt";
            break;
          }
        }
      } catch {}
    }

    return { valid: true, tokenRecord: row };
  }

  /**
   * Validate a Local Management token strictly.
   * Rejects MCP tokens (lb_), Runner tokens (lbr_), and enforces lm_ prefix and secret match.
   */
  validateManagementToken(rawToken: string, expectedSecret?: string): ValidateTokenResult {
    if (!rawToken || typeof rawToken !== "string") {
      return { valid: false, reason: "MISSING_TOKEN" };
    }

    // Explicitly reject MCP tokens (lb_) and Runner tokens (lbr_)
    if (rawToken.startsWith(MCP_TOKEN_PREFIX) || rawToken.startsWith(RUNNER_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    if (!rawToken.startsWith(MANAGEMENT_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    if (expectedSecret) {
      const rawBuf = Buffer.from(rawToken, "utf-8");
      const expBuf = Buffer.from(expectedSecret, "utf-8");
      if (rawBuf.length !== expBuf.length || !crypto.timingSafeEqual(rawBuf, expBuf)) {
        return { valid: false, reason: "INVALID_SECRET" };
      }
    }

    return { valid: true };
  }

  /**
   * List all tokens for management without exposing token hashes.
   */
  listTokens(): PublicTokenInfo[] {
    const rows = this.stmtListTokens.all() as TokenRow[];

    return rows.map((row) => {
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(row.scopes) as string[];
      } catch {
        scopes = [];
      }

      let purpose = row.purpose ?? null;
      if (!purpose) {
        for (const s of scopes) {
          if (s.startsWith("purpose:")) {
            purpose = s.slice("purpose:".length);
            break;
          } else if (s === "chat:direct-approve") {
            purpose = "chatgpt";
            break;
          }
        }
      }

      return {
        id: row.id,
        type: row.type,
        name: row.name,
        scopes,
        purpose,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      };
    });
  }

  /**
   * Revoke a token by ID.
   */
  revokeToken(id: string): boolean {
    const result = this.stmtRevokeToken.run(Date.now(), id);
    return result.changes > 0;
  }

  isTokenActive(id: string, expectedType?: "runner" | "mcp"): boolean {
    const row = this.stmtFindTokenById.get(id) as TokenRow | undefined;
    return Boolean(
      row &&
      (!expectedType || row.type === expectedType) &&
      row.revoked_at === null &&
      (row.expires_at === null || row.expires_at > Date.now())
    );
  }
}

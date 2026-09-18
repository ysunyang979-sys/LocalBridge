import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  generateMcpToken,
  generateRunnerToken,
  hashToken,
  verifyToken,
  MCP_TOKEN_PREFIX,
  RUNNER_TOKEN_PREFIX,
  type TokenType,
} from "@localbridge/shared";
import type { TokenRow } from "./schema.js";

export interface CreateTokenParams {
  name: string;
  type: TokenType;
  scopes?: string[];
  expiresAt?: number | null;
}

export interface CreatedTokenResult {
  id: string;
  name: string;
  type: TokenType;
  token: string;
  createdAt: number;
  expiresAt: number | null;
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
}

export interface ValidateTokenResult {
  valid: boolean;
  tokenRecord?: TokenRow;
  reason?:
    | "MISSING_TOKEN"
    | "INVALID_TOKEN_TYPE"
    | "TOKEN_NOT_FOUND"
    | "TOKEN_REVOKED"
    | "TOKEN_EXPIRED";
}

export class TokenService {
  constructor(private readonly db: Database.Database) {}

  /**
   * Create a new cryptographically secure token.
   * The plaintext token is returned ONLY ONCE in the result and NEVER saved to the database.
   */
  createToken(params: CreateTokenParams): CreatedTokenResult {
    const id = `tok_${crypto.randomUUID()}`;
    const token =
      params.type === "runner" ? generateRunnerToken() : generateMcpToken();
    const tokenHash = hashToken(token);
    const createdAt = Date.now();
    const scopesJson = JSON.stringify(params.scopes ?? []);
    const expiresAt = params.expiresAt ?? null;

    this.db
      .prepare(
        `INSERT INTO tokens (id, type, token_hash, name, scopes, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, params.type, tokenHash, params.name, scopesJson, createdAt, expiresAt);

    return {
      id,
      name: params.name,
      type: params.type,
      token,
      createdAt,
      expiresAt,
    };
  }

  /**
   * Validate a runner token strictly.
   * Rejects MCP tokens, revoked tokens, expired tokens, and unknown tokens.
   */
  validateRunnerToken(rawToken: string): ValidateTokenResult {
    if (!rawToken || typeof rawToken !== "string") {
      return { valid: false, reason: "MISSING_TOKEN" };
    }

    // Explicitly reject MCP tokens (lb_ prefix)
    if (rawToken.startsWith(MCP_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    if (!rawToken.startsWith(RUNNER_TOKEN_PREFIX)) {
      return { valid: false, reason: "INVALID_TOKEN_TYPE" };
    }

    const tokenHash = hashToken(rawToken);

    const row = this.db
      .prepare(
        `SELECT id, type, token_hash, name, scopes, created_at, last_used_at, expires_at, revoked_at
         FROM tokens
         WHERE token_hash = ? AND type = 'runner'`
      )
      .get(tokenHash) as TokenRow | undefined;

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
    this.db
      .prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?")
      .run(Date.now(), row.id);

    return { valid: true, tokenRecord: row };
  }

  /**
   * List all tokens for management without exposing token hashes.
   */
  listTokens(): PublicTokenInfo[] {
    const rows = this.db
      .prepare(
        `SELECT id, type, name, scopes, created_at, last_used_at, expires_at, revoked_at
         FROM tokens
         ORDER BY created_at DESC`
      )
      .all() as TokenRow[];

    return rows.map((row) => {
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(row.scopes) as string[];
      } catch {
        scopes = [];
      }

      return {
        id: row.id,
        type: row.type,
        name: row.name,
        scopes,
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
    const result = this.db
      .prepare("UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(Date.now(), id);

    return result.changes > 0;
  }
}

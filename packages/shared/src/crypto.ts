import crypto from "node:crypto";

export const MCP_TOKEN_PREFIX = "lb_";
export const RUNNER_TOKEN_PREFIX = "lbr_";
export const MANAGEMENT_TOKEN_PREFIX = "lm_";

export type TokenType = "mcp" | "runner" | "management";

/**
 * Generate a secure cryptographically random token for MCP client.
 * e.g. "lb_7f8a9b..."
 */
export function generateMcpToken(): string {
  const bytes = crypto.randomBytes(32).toString("hex");
  return `${MCP_TOKEN_PREFIX}${bytes}`;
}

/**
 * Generate a secure cryptographically random token for Runner daemon.
 * e.g. "lbr_7f8a9b..."
 */
export function generateRunnerToken(): string {
  const bytes = crypto.randomBytes(32).toString("hex");
  return `${RUNNER_TOKEN_PREFIX}${bytes}`;
}

/**
 * Generate a secure cryptographically random token for local management channel.
 * e.g. "lm_7f8a9b..."
 */
export function generateManagementToken(): string {
  const bytes = crypto.randomBytes(32).toString("hex");
  return `${MANAGEMENT_TOKEN_PREFIX}${bytes}`;
}

/**
 * Detect token type from prefix.
 */
export function getTokenType(token: string): TokenType | null {
  if (token.startsWith(MCP_TOKEN_PREFIX)) return "mcp";
  if (token.startsWith(RUNNER_TOKEN_PREFIX)) return "runner";
  if (token.startsWith(MANAGEMENT_TOKEN_PREFIX)) return "management";
  return null;
}

/**
 * Calculate SHA-256 hash of a token for storage in database.
 * Never store the raw token in persistent storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time verification of token against its stored hash.
 */
export function verifyToken(rawToken: string, expectedHash: string): boolean {
  const actualHash = hashToken(rawToken);
  const actualBuf = Buffer.from(actualHash, "utf-8");
  const expectedBuf = Buffer.from(expectedHash, "utf-8");

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Compute SHA-256 of arbitrary content (strings or buffers), e.g. for file diffs.
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

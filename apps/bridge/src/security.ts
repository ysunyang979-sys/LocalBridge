import path from "node:path";

export interface SecurityConfig {
  bridgeToken: string;
}

import type { OAuthStore } from "./oauth.js";

/**
 * Validates the Authorization Bearer token.
 * Returns true if valid, false if invalid or missing.
 */
export function validateBearerToken(
  authHeader: string | undefined,
  expectedToken: string
): { valid: boolean; error?: string } {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { valid: false, error: "Invalid Authorization format. Expected 'Bearer <TOKEN>'" };
  }

  const providedToken = parts[1];
  if (providedToken !== expectedToken) {
    return { valid: false, error: "Invalid or unauthorized token" };
  }

  return { valid: true };
}

/**
 * Validates an incoming Authorization header against either:
 * 1. Legacy/Direct static Bearer token (NEXUS_BRIDGE_TOKEN)
 * 2. OAuth 2.0 Access Token issued by the Bridge
 */
export function validateRequestAuth(
  authHeader: string | undefined,
  staticToken: string,
  oauthStore: OAuthStore
): { valid: boolean; authType?: "bearer" | "oauth"; error?: string } {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { valid: false, error: "Invalid Authorization format. Expected 'Bearer <TOKEN>'" };
  }

  const token = parts[1];

  // 1. Check static token
  if (staticToken && token === staticToken) {
    return { valid: true, authType: "bearer" };
  }

  // 2. Check OAuth access token
  const oauthRes = oauthStore.validateAccessToken(token);
  if (oauthRes.valid) {
    return { valid: true, authType: "oauth" };
  }

  return { valid: false, error: "Invalid or expired token" };
}

/**
 * Validates that a requested file path does not escape the project's canonical root directory.
 * Strictly forbids '../', parent directory traversal, and absolute paths outside the root.
 */
export function validatePathSandbox(
  projectRoot: string,
  relativePath: string
): { valid: boolean; resolvedPath?: string; error?: string } {
  if (!relativePath || typeof relativePath !== "string") {
    return { valid: false, error: "Path must be a non-empty string" };
  }

  // Normalize slashes
  const normalized = relativePath.replace(/\\/g, "/");

  // Explicit check for dangerous patterns
  if (
    normalized.includes("../") ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.includes("/..")
  ) {
    return {
      valid: false,
      error: "Path traversal forbidden: '..' is not allowed in path",
    };
  }

  // Resolve absolute path and verify boundary
  const resolved = path.resolve(projectRoot, relativePath);
  const normalizedRoot = path.resolve(projectRoot);

  if (!resolved.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    return {
      valid: false,
      error: "Access denied: Path resolves outside the project root directory",
    };
  }

  return { valid: true, resolvedPath: resolved };
}

/**
 * Redacts sensitive credentials and tokens from logs.
 */
export function sanitizeLog(text: string): string {
  if (!text) return "";
  return text
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]")
    .replace(/lb_[a-f0-9]{32,}/gi, "lb_[REDACTED]")
    .replace(/lm_[a-f0-9]{32,}/gi, "lm_[REDACTED]")
    .replace(/"token":\s*"[^"]+"/gi, '"token":"[REDACTED]"');
}

/**
 * Structured request logger for MCP invocations.
 */
export function logMcpRequest(info: {
  method?: string;
  tool?: string;
  ip?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}) {
  const timestamp = new Date().toISOString();
  const status = info.success ? "SUCCESS" : "FAILED";
  const toolName = info.tool ? ` tool=${info.tool}` : "";
  const duration = info.durationMs !== undefined ? ` ${info.durationMs}ms` : "";
  const err = info.error ? ` error="${info.error}"` : "";

  console.log(
    `[${timestamp}] [MCP] ${info.ip || "127.0.0.1"} ${info.method || "POST"} ${status}${toolName}${duration}${err}`
  );
}

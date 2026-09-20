import os from "node:os";

const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const LOCALBRIDGE_TOKEN_REGEX = /\b(lb_|lbr_|lm_)[a-fA-F0-9]{16,}\b/g;
const OPENAI_KEY_REGEX = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const SENSITIVE_KV_REGEX = /(["']?(?:password|secret|apiKey|api_key|token|authorization|auth)["']?\s*[:=]\s*["']?)([^"',\s}]+)(["']?)/gi;

/**
 * Redacts secrets, tokens, API keys, and physical user home paths from strings.
 */
export function sanitizeSessionString(input: string): string {
  if (!input || typeof input !== "string") return "";

  let result = input
    .replace(BEARER_REGEX, "Bearer [REDACTED]")
    .replace(LOCALBRIDGE_TOKEN_REGEX, "[REDACTED_TOKEN]")
    .replace(OPENAI_KEY_REGEX, "[REDACTED_API_KEY]")
    .replace(SENSITIVE_KV_REGEX, "$1[REDACTED]$3");

  const home = os.homedir();
  if (home && home.length > 2) {
    const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const homeRegex = new RegExp(escapedHome, process.platform === "win32" ? "gi" : "g");
    result = result.replace(homeRegex, "<user-home>");
  }

  return result;
}

/**
 * Deep-sanitizes arbitrary JSON metadata for session event storage and handoffs.
 * Strips raw source code, large buffers, and redacts sensitive keys.
 */
export function sanitizeSessionMetadata(input: unknown, depth = 0): any {
  if (depth > 5) return input;
  if (input === null || typeof input !== "object") {
    if (typeof input === "string") {
      return sanitizeSessionString(input);
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.slice(0, 100).map((item) => {
      if (typeof item === "string") return sanitizeSessionString(item);
      if (typeof item === "object" && item !== null) return sanitizeSessionMetadata(item, depth + 1);
      return item;
    });
  }

  const result: Record<string, unknown> = {};
  const record = input as Record<string, unknown>;

  // Drop fields known to carry massive source code or raw data
  const dropFields = new Set([
    "sourceText",
    "fileContent",
    "content",
    "stdout",
    "stderr",
    "rawOutput",
    "fullEnv",
    "env",
    "diff",
    "patch",
  ]);

  for (const [key, value] of Object.entries(record)) {
    if (dropFields.has(key)) {
      if (typeof value === "string") {
        result[`${key}Length`] = value.length;
      }
      continue;
    }

    // Scrub key names that imply secrets
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("apikey") ||
      lowerKey.includes("token") ||
      lowerKey.includes("auth")
    ) {
      result[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "string") {
      result[key] = sanitizeSessionString(value);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value;
    } else if (typeof value === "object") {
      result[key] = sanitizeSessionMetadata(value, depth + 1);
    }
  }

  return result;
}

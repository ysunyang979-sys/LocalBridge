import type { DecisionContext } from "@localbridge/protocol";

const SENSITIVE_TOKEN_REGEX = /\b(lb_[a-f0-9]{32,}|lbr_[a-f0-9]{32,}|lm_[a-f0-9]{32,}|Bearer\s+[a-zA-Z0-9_\-\.]+)\b/gi;
const SENSITIVE_KEY_VALUE_REGEX = /(?:password|secret|token|api_?key|auth|private_?key|cert)\s*[:=]\s*["']?([^\s"',;]+)["']?/gi;
const SENSITIVE_PATH_PATTERNS = [
  { pattern: /\/?\.env(\.[a-zA-Z0-9_\-]+)?$/i, replacement: "[REDACTED_ENV]" },
  { pattern: /\/?id_rsa(\.pub)?$/i, replacement: "[REDACTED_PRIVATE_KEY]" },
  { pattern: /\/?\.aws\/credentials$/i, replacement: "[REDACTED_AWS_CREDENTIALS]" },
  { pattern: /\/?\.kube\/config$/i, replacement: "[REDACTED_KUBE_CONFIG]" },
  { pattern: /\/?\.ssh\/.+$/i, replacement: "[REDACTED_SSH_KEY]" },
];

/**
 * Sanitizes an arbitrary string by redacting tokens, keys, secrets, and sensitive paths.
 */
export function sanitizeString(input: string): string {
  if (!input) return input;
  let sanitized = input.replace(SENSITIVE_TOKEN_REGEX, "[REDACTED_TOKEN]");
  sanitized = sanitized.replace(SENSITIVE_KEY_VALUE_REGEX, (match, val) => {
    return match.replace(val, "[REDACTED_SECRET]");
  });
  for (const { pattern, replacement } of SENSITIVE_PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

/**
 * Creates a strictly sanitized DecisionContext safe to pass to external/local AI decision workers.
 * Ensures zero leakage of file contents, tokens, API keys, credentials, or secrets.
 */
export function sanitizeDecisionContext(context: DecisionContext): DecisionContext {
  const sanitized: DecisionContext = {
    operation: sanitizeString(context.operation || ""),
    toolName: context.toolName ? sanitizeString(context.toolName) : undefined,
    projectId: context.projectId ? sanitizeString(context.projectId) : undefined,
    projectName: context.projectName ? sanitizeString(context.projectName) : undefined,
    accessMode: context.accessMode,
    executionMode: context.executionMode,
    trustLevel: context.trustLevel,
    pathType: context.pathType,
    protectedResource: Boolean(context.protectedResource),
    currentPolicyDecision: context.currentPolicyDecision,
    locale: context.locale || "en",
  };

  if (context.command) {
    sanitized.command = sanitizeString(context.command);
  }

  if (Array.isArray(context.args)) {
    sanitized.args = context.args.map((arg) => sanitizeString(String(arg)));
  }

  // Strictly omit file contents, body, raw data, or sensitive parameters
  for (const [key, val] of Object.entries(context)) {
    if (
      key === "content" ||
      key === "fileContent" ||
      key === "body" ||
      key === "patch" ||
      key === "diff" ||
      key === "token" ||
      key === "secret" ||
      key === "key" ||
      key === "credentials"
    ) {
      continue;
    }
    if (!(key in sanitized) && typeof val === "string") {
      sanitized[key] = sanitizeString(val);
    }
  }

  return sanitized;
}

export * from "./command/types.js";

export const DEFAULT_SENSITIVE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "id_rsa",
  "id_rsa.pub",
  "id_ed25519",
  "id_ed25519.pub",
  "credentials.json",
  "id_ecdsa",
] as const;

export const DANGEROUS_COMMAND_RULES = [
  { pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|\s+-[a-zA-Z]*f[a-zA-Z]*\s+).*(\/|~|\.\.)/i, reason: "Recursive force deletion of root/home/parent directory" },
  { pattern: /\brm\s+-rf\s+[\/\*]/i, reason: "Destructive recursive removal" },
  { pattern: /\bdel\s+\/s\b/i, reason: "Windows recursive file deletion" },
  { pattern: /\bformat\s+[a-zA-Z]:/i, reason: "Drive format command" },
  { pattern: /\bdiskpart\b/i, reason: "Disk partition utility" },
  { pattern: /\bshutdown\b/i, reason: "System shutdown command" },
  { pattern: /\breboot\b/i, reason: "System reboot command" },
  { pattern: /\breg\s+delete\b/i, reason: "Windows registry deletion" },
  { pattern: /\bRemove-Item\s+.*-Recurse\b/i, reason: "PowerShell recursive item deletion" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "Destructive git hard reset" },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i, reason: "Destructive git clean" },
  { pattern: /\bDROP\s+DATABASE\b/i, reason: "SQL database drop statement" },
] as const;

export interface PathValidationResult {
  allowed: boolean;
  canonicalPath?: string;
  reason?: string;
}

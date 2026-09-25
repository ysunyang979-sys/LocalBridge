import crypto from "node:crypto";

/**
 * Normalizes error messages and command strings to generate a consistent
 * failure fingerprint for loop detection.
 */
export function normalizeErrorText(error?: string): string {
  if (!error) return "";
  return error
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/[a-zA-Z]:\\[^ \t\r\n]+/g, "<path>")
    .replace(/\/[^ \t\r\n]+/g, "<path>")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?\b/g, "<timestamp>")
    .replace(/\b(pid|port)\s*[:=]?\s*\d+/gi, "<id>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Computes a deterministic SHA-256 fingerprint for a command execution failure.
 */
export function computeFailureFingerprint(
  command: string,
  exitCode: number,
  errorText?: string
): string {
  const normCmd = command.trim().toLowerCase().replace(/\s+/g, " ");
  const normError = normalizeErrorText(errorText);
  const raw = `${normCmd}|${exitCode}|${normError}`;

  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

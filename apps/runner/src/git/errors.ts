import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

/**
 * Strips user home directories, drive letters, and physical paths from Git error messages.
 */
export function sanitizeGitErrorMessage(message: string, canonicalRoot?: string): string {
  let sanitized = message;

  if (canonicalRoot) {
    // Replace all occurrences of canonical root
    const escaped = canonicalRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    sanitized = sanitized.replace(new RegExp(escaped, "gi"), "<project-root>");
  }

  // Redact Windows absolute paths (e.g. C:\Users\... or D:\...)
  sanitized = sanitized.replace(/[a-zA-Z]:\\[^:\n\r"']+/g, "<redacted-path>");
  // Redact POSIX absolute paths (e.g. /home/... or /Users/...)
  sanitized = sanitized.replace(/\/(home|Users|root|var|tmp|private)\/[^:\n\r"']+/g, "<redacted-path>");

  return sanitized.trim();
}

/**
 * Classifies Git process failures and returns a structured LocalBridgeError.
 */
export function mapGitProcessError(
  stderr: string,
  exitCode: number,
  canonicalRoot?: string
): LocalBridgeError {
  const cleanStderr = stderr.trim().toLowerCase();

  if (
    cleanStderr.includes("not a git repository") ||
    cleanStderr.includes("fatal: not a git repository")
  ) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_NOT_REPOSITORY,
      "Target directory is not a Git repository"
    );
  }

  if (cleanStderr.includes("detected dubious ownership")) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_UNSAFE_REPOSITORY,
      "Git detected dubious ownership in repository"
    );
  }

  const sanitized = sanitizeGitErrorMessage(stderr, canonicalRoot);
  const userMessage = sanitized.length > 0 ? sanitized : `Git process exited with code ${exitCode}`;

  return new LocalBridgeError(
    LocalBridgeErrorCode.GIT_PROCESS_FAILED,
    `Git operation failed: ${userMessage}`
  );
}

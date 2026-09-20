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

  if (
    cleanStderr.includes("overwritten by checkout") ||
    cleanStderr.includes("overwritten by switch") ||
    cleanStderr.includes("please commit your changes or stash them")
  ) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_WORKTREE_CONFLICT,
      "Branch switch aborted: uncommitted changes in worktree would conflict with target branch"
    );
  }

  if (cleanStderr.includes("did not match any files") || cleanStderr.includes("pathspec") && cleanStderr.includes("did not match")) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_PATH_NOT_FOUND,
      `Path did not match any files: ${sanitizeGitErrorMessage(stderr, canonicalRoot)}`
    );
  }

  if (cleanStderr.includes("already exists") && cleanStderr.includes("branch")) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_BRANCH_EXISTS,
      `Target branch already exists: ${sanitizeGitErrorMessage(stderr, canonicalRoot)}`
    );
  }

  if (cleanStderr.includes("not a valid branch name") || cleanStderr.includes("is not a valid branch name")) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Invalid branch name: ${sanitizeGitErrorMessage(stderr, canonicalRoot)}`
    );
  }

  if (cleanStderr.includes("nothing to commit") || cleanStderr.includes("no changes added to commit")) {
    return new LocalBridgeError(
      LocalBridgeErrorCode.GIT_NOTHING_STAGED,
      "No staged changes to commit. Stage files before committing."
    );
  }

  const sanitized = sanitizeGitErrorMessage(stderr, canonicalRoot);
  const userMessage = sanitized.length > 0 ? sanitized : `Git process exited with code ${exitCode}`;

  return new LocalBridgeError(
    LocalBridgeErrorCode.GIT_PROCESS_FAILED,
    `Git operation failed: ${userMessage}`
  );
}

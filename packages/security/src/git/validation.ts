import path from "node:path";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { isAbsoluteDenyPath } from "../path/sensitive.js";

/**
 * Validates a single path provided to git stage or unstage.
 * Strictly enforces project boundary, disallows '..', absolute paths, and .git directory.
 */
export function validateGitPath(rawPath: string): string {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.INVALID_REQUEST,
      "Path must be a non-empty string"
    );
  }

  const trimmed = rawPath.trim();

  // Disallow absolute paths (POSIX / or Windows C:\ or UNC \\)
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("\\\\")
  ) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      `Absolute path "${trimmed}" is strictly prohibited. Provide a relative path within project.`
    );
  }

  // Normalize to POSIX slashes
  const normalized = trimmed.replace(/\\/g, "/");

  // Check for path traversal segments
  const segments = normalized.split("/");
  if (segments.some((seg) => seg === "..")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      `Path traversal ("..") in "${trimmed}" is strictly prohibited`
    );
  }

  // Strictly block .git directory access
  if (
    normalized === ".git" ||
    normalized.startsWith(".git/") ||
    segments.some((seg) => seg.toLowerCase() === ".git")
  ) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.POLICY_DENIED,
      `Access to .git repository internals ("${trimmed}") is strictly denied by security boundary`
    );
  }

  // Check absolute deny paths
  if (isAbsoluteDenyPath(normalized)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.POLICY_DENIED,
      `Access to protected path "${trimmed}" is denied by security boundary`
    );
  }

  // Clean redundant leading ./
  const cleanPath = path.posix.normalize(normalized).replace(/^(\.\/)+/, "");
  if (!cleanPath || cleanPath === ".") {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.INVALID_REQUEST,
      `Invalid relative path "${trimmed}". Wildcards and root "." are not permitted.`
    );
  }

  return cleanPath;
}

/**
 * Validates, deduplicates, and canonicalizes an array of relative paths for git operations.
 * Paths are returned in deterministic lexicographical order to ensure predictable payload hashes.
 */
export function canonicalizeGitPaths(paths: string[]): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.INVALID_REQUEST,
      "Paths array must contain at least one valid path"
    );
  }

  if (paths.length > 128) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.INVALID_REQUEST,
      "Paths array exceeds maximum limit of 128 paths"
    );
  }

  const validatedSet = new Set<string>();
  for (const p of paths) {
    const valid = validateGitPath(p);
    validatedSet.add(valid);
  }

  return Array.from(validatedSet).sort();
}

/**
 * Validates a Git branch name format against ref format rules.
 * Enforces safe branch naming without shell metacharacters or dangerous refs.
 */
export function validateBranchNameFormat(branchName: string): string {
  if (typeof branchName !== "string" || !branchName.trim()) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      "Branch name must be a non-empty string"
    );
  }

  const name = branchName.trim();

  if (name.length > 255) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      "Branch name exceeds maximum allowed length of 255 characters"
    );
  }

  // Ref format constraints per git-check-ref-format
  if (name.startsWith("-")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot start with a dash ("-"): "${name}"`
    );
  }

  if (name.startsWith("/") || name.endsWith("/")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot start or end with a slash: "${name}"`
    );
  }

  if (name.includes("//")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot contain consecutive slashes: "${name}"`
    );
  }

  if (name.includes("..")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot contain consecutive dots (".."): "${name}"`
    );
  }

  if (name.includes("@{")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot contain sequence "@{": "${name}"`
    );
  }

  if (name === "@") {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot be a single "@": "${name}"`
    );
  }

  if (name.endsWith(".lock")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name cannot end with ".lock": "${name}"`
    );
  }

  // Disallow control chars, space, and git special characters (~, ^, :, ?, *, [, \, etc.)
  // and shell metacharacters ($, `, ;, &, |, <, >, ", ')
  const illegalCharsRegex = /[\x00-\x20\x7F~^:?*\[\\$;`&|<>"']/;
  if (illegalCharsRegex.test(name)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_INVALID_BRANCH_NAME,
      `Branch name contains illegal or control characters: "${name}"`
    );
  }

  return name;
}

import fs from "node:fs";
import path from "node:path";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import type { GitProcessRunner } from "./process.js";
import type { GitRepoValidationResult } from "./types.js";

function canonicalize(p: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  } catch {
    resolved = fs.realpathSync(p);
  }
  if (process.platform === "win32" && resolved.startsWith("\\\\?\\")) {
    resolved = resolved.slice(4);
  }
  return path.normalize(resolved);
}

function arePathsEqual(p1: string, p2: string): boolean {
  const norm1 = canonicalize(p1);
  const norm2 = canonicalize(p2);
  if (process.platform === "win32") {
    return norm1.toLowerCase() === norm2.toLowerCase();
  }
  return norm1 === norm2;
}

/**
 * Validates that the authorized project root is a valid Git repository AND
 * that the repository's worktree toplevel root exactly matches the project root.
 */
export async function validateRepository(
  runner: GitProcessRunner,
  canonicalProjectRoot: string
): Promise<GitRepoValidationResult> {
  const result = await runner.exec({
    cwd: canonicalProjectRoot,
    args: ["rev-parse", "--is-inside-work-tree", "--show-toplevel"],
  });

  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const isInside = lines[0]?.trim() === "true";
  const worktreeRoot = lines[1]?.trim();

  if (!isInside || !worktreeRoot) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_NOT_REPOSITORY,
      "Project directory is not a Git repository"
    );
  }

  // Enforce repository boundary: worktree root MUST strictly equal project canonical root
  if (!arePathsEqual(worktreeRoot, canonicalProjectRoot)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.GIT_REPOSITORY_BOUNDARY,
      "Project directory is a subdirectory of a parent Git repository. Access is blocked by repository boundary policy."
    );
  }

  return {
    isRepository: true,
    worktreeRoot,
  };
}

/**
 * Verifies that the local git repository config does not declare malicious or external extension hooks:
 * - custom filter drivers (filter.*.clean, filter.*.smudge, filter.*.process)
 * - custom diff drivers (diff.*.command, diff.*.textconv)
 * - custom merge drivers (merge.*.driver)
 * - external gpg programs (gpg.program, gpg.*.program, commit.gpgSign)
 * - core hooks or monitor overrides (core.hooksPath, core.fsmonitor)
 */
export async function assertSafeGitConfig(
  runner: GitProcessRunner,
  cwd: string
): Promise<void> {
  let output = "";
  try {
    const res = await runner.exec({
      cwd,
      args: ["config", "--local", "-l"],
      timeoutMs: 3000,
    });
    output = res.stdout;
  } catch {
    // If git config fails (e.g. fresh repo or no config file yet), try reading .git/config manually if present
    try {
      const gitConfigFile = path.join(cwd, ".git", "config");
      if (fs.existsSync(gitConfigFile)) {
        output = fs.readFileSync(gitConfigFile, "utf-8");
      }
    } catch {
      // Ignore
    }
  }

  if (!output) return;

  const lines = output.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim().toLowerCase();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;

    // In 'git config -l' format: key=value
    const key = line.split("=")[0]?.trim();
    if (!key) continue;

    const isUnsafeFilter =
      key.startsWith("filter.") &&
      (key.includes(".clean") || key.includes(".smudge") || key.includes(".process"));
    const isUnsafeDiff =
      key.startsWith("diff.") &&
      (key.includes(".command") || key.includes(".textconv"));
    const isUnsafeMerge =
      key.startsWith("merge.") && key.includes(".driver");
    const isUnsafeGpg =
      key === "gpg.program" ||
      (key.startsWith("gpg.") && key.endsWith(".program")) ||
      key === "commit.gpgsign";
    const isUnsafeCore =
      key === "core.fsmonitor" || key === "core.hookspath";

    if (isUnsafeFilter || isUnsafeDiff || isUnsafeMerge || isUnsafeGpg || isUnsafeCore) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.GIT_CONFIG_UNSAFE,
        `Unsafe local Git configuration detected: "${key}". Custom filters, diff/merge drivers, or external gpg programs in local repository config are blocked for security.`
      );
    }
  }
}

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

import type { GitStatusEntry, GitStatusEntryKind } from "@localbridge/protocol";
import { isSensitiveFile } from "@localbridge/security";

export const MAX_STATUS_ENTRIES = 500;

export interface ParsedPorcelainV2 {
  branch: string | null;
  detached: boolean;
  head: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
  sensitiveEntriesFiltered: boolean;
  truncated: boolean;
  clean: boolean;
}

/**
 * Parses NUL-delimited output from `git status --porcelain=v2 --branch -z`.
 */
export function parsePorcelainV2(rawOutput: string): ParsedPorcelainV2 {
  const tokens = rawOutput.split("\0");
  let branch: string | null = null;
  let detached = false;
  let head: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  let sensitiveEntriesFiltered = false;
  const allEntries: GitStatusEntry[] = [];

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }

    if (token.startsWith("# branch.oid ")) {
      const oid = token.slice(13).trim();
      head = oid === "(initial)" ? null : oid;
    } else if (token.startsWith("# branch.head ")) {
      const b = token.slice(14).trim();
      if (b === "(detached)") {
        detached = true;
        branch = null;
      } else {
        detached = false;
        branch = b || null;
      }
    } else if (token.startsWith("# branch.upstream ")) {
      upstream = token.slice(18).trim() || null;
    } else if (token.startsWith("# branch.ab ")) {
      const abStr = token.slice(12).trim();
      const abMatch = /^\+(\d+)\s+-(\d+)$/.exec(abStr);
      if (abMatch) {
        ahead = parseInt(abMatch[1]!, 10);
        behind = parseInt(abMatch[2]!, 10);
      }
    } else if (token.startsWith("# ")) {
      // Other headers (e.g. # stash ...), ignore
    } else if (token.startsWith("1 ")) {
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const match = /^1\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(token);
      if (match) {
        const xy = match[1]!;
        const filePath = match[2]!;
        if (isSensitiveFile(filePath)) {
          sensitiveEntriesFiltered = true;
        } else {
          const indexStatus = xy[0] || ".";
          const worktreeStatus = xy[1] || ".";
          let kind: GitStatusEntryKind = "modified";
          if (indexStatus === "A") {
            kind = "added";
          } else if (indexStatus === "D" || worktreeStatus === "D") {
            kind = "deleted";
          } else if (indexStatus === "T" || worktreeStatus === "T") {
            kind = "typechanged";
          } else {
            kind = "modified";
          }

          allEntries.push({
            path: filePath.replace(/\\/g, "/"),
            indexStatus,
            worktreeStatus,
            kind,
          });
        }
      }
    } else if (token.startsWith("2 ")) {
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>
      // followed by origPath in next token
      const match = /^2\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(token);
      const origPath = tokens[i + 1] || "";
      i++; // consume origPath

      if (match) {
        const xy = match[1]!;
        const filePath = match[2]!;
        if (isSensitiveFile(filePath) || (origPath && isSensitiveFile(origPath))) {
          sensitiveEntriesFiltered = true;
        } else {
          allEntries.push({
            path: filePath.replace(/\\/g, "/"),
            indexStatus: xy[0] || "R",
            worktreeStatus: xy[1] || ".",
            kind: "renamed",
            oldPath: origPath.replace(/\\/g, "/"),
          });
        }
      }
    } else if (token.startsWith("u ")) {
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const match = /^u\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(token);
      if (match) {
        const xy = match[1]!;
        const filePath = match[2]!;
        if (isSensitiveFile(filePath)) {
          sensitiveEntriesFiltered = true;
        } else {
          allEntries.push({
            path: filePath.replace(/\\/g, "/"),
            indexStatus: xy[0] || "U",
            worktreeStatus: xy[1] || "U",
            kind: "conflicted",
          });
        }
      }
    } else if (token.startsWith("? ")) {
      const filePath = token.slice(2).trim();
      if (isSensitiveFile(filePath)) {
        sensitiveEntriesFiltered = true;
      } else {
        allEntries.push({
          path: filePath.replace(/\\/g, "/"),
          indexStatus: "?",
          worktreeStatus: "?",
          kind: "untracked",
        });
      }
    }
    i++;
  }

  const truncated = allEntries.length > MAX_STATUS_ENTRIES;
  const entries = truncated ? allEntries.slice(0, MAX_STATUS_ENTRIES) : allEntries;
  const clean = allEntries.length === 0 && !sensitiveEntriesFiltered;

  return {
    branch,
    detached,
    head,
    upstream,
    ahead,
    behind,
    entries,
    sensitiveEntriesFiltered,
    truncated,
    clean,
  };
}

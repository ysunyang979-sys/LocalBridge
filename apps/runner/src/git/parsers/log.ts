import type { GitCommitSummary } from "@localbridge/protocol";

/**
 * Parses NUL-delimited output from `git log -z --format=%H%x00%h%x00%an%x00%at%x00%s`.
 * Converts Unix timestamp (seconds) to milliseconds.
 * Strictly excludes author email and commit body.
 */
export function parseGitLog(rawOutput: string): GitCommitSummary[] {
  if (!rawOutput || !rawOutput.trim()) {
    return [];
  }

  const tokens = rawOutput.split("\0");
  const commits: GitCommitSummary[] = [];

  for (let i = 0; i + 4 < tokens.length; i += 5) {
    const hash = tokens[i]?.trim();
    const shortHash = tokens[i + 1]?.trim();
    const authorName = tokens[i + 2]?.trim();
    const rawTimestamp = tokens[i + 3]?.trim();
    const subject = tokens[i + 4] ?? "";

    if (!hash || !shortHash) {
      continue;
    }

    const seconds = parseInt(rawTimestamp || "0", 10);
    const timestamp = isNaN(seconds) ? 0 : seconds * 1000;

    commits.push({
      hash,
      shortHash,
      authorName: authorName || "Unknown",
      timestamp,
      subject: subject.trim(),
    });
  }

  return commits;
}

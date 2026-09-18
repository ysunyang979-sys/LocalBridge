import os from "node:os";

// Matches OSC sequences (\x1b]...\x07 or \x1b]...\x1b\)
const OSC_REGEX = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

// Matches ANSI CSI escape codes (\x1b[...)
const CSI_REGEX = /\x1b\[[0-9:;<=>?]*[ -/]*[@-~]/g;

// Matches other two-character ESC sequences
const OTHER_ESC_REGEX = /\x1b[@-Z\\_]/g;

// Matches non-printable ASCII control characters, preserving \t (0x09), \n (0x0A), and \r (0x0D)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strips ANSI CSI sequences, OSC hyperlinks, and non-printable control characters
 * from process output while preserving newlines, tabs, and all UTF-8 characters (including Chinese, emojis).
 */
export function stripAnsiAndControlCodes(input: string): string {
  if (!input) return "";
  const noOsc = input.replace(OSC_REGEX, "");
  const noCsi = noOsc.replace(CSI_REGEX, "");
  const noEsc = noCsi.replace(OTHER_ESC_REGEX, "");
  return noEsc.replace(CONTROL_CHARS_REGEX, "");
}

export interface PathRedactionTarget {
  rawPath: string;
  placeholder: string;
}

/**
 * Creates a regular expression matching a filesystem path with both forward
 * and backward slashes, case-insensitive on Windows.
 */
function createPathRegex(rawPath: string): RegExp {
  const normalized = rawPath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/);
  const escapedParts = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = escapedParts.join("[\\\\/]+");
  return new RegExp(pattern, process.platform === "win32" ? "gi" : "g");
}

/**
 * Redacts physical host filesystem paths from process output, replacing them with
 * standardized placeholders (e.g. <project-root>, <runner-state>, <user-home>).
 * Longer paths are matched first to prevent partial redactions.
 */
export function redactPhysicalPaths(
  input: string,
  targets: PathRedactionTarget[]
): string {
  if (!input || targets.length === 0) return input;

  // Filter out empty or root targets and sort longest first
  const validTargets = targets
    .filter((t) => Boolean(t.rawPath) && t.rawPath.length > 2)
    .sort((a, b) => b.rawPath.length - a.rawPath.length);

  let result = input;
  for (const target of validTargets) {
    try {
      const regex = createPathRegex(target.rawPath);
      result = result.replace(regex, target.placeholder);
    } catch {
      // Continue with remaining targets if regex creation fails
    }
  }

  return result;
}

/**
 * Combines ANSI stripping and path redactions for process output.
 */
export function sanitizeProcessOutput(
  rawOutput: string,
  canonicalProjectRoot?: string,
  runnerStateDir?: string
): string {
  const stripped = stripAnsiAndControlCodes(rawOutput);

  const targets: PathRedactionTarget[] = [];
  if (canonicalProjectRoot) {
    targets.push({ rawPath: canonicalProjectRoot, placeholder: "<project-root>" });
  }
  if (runnerStateDir) {
    targets.push({ rawPath: runnerStateDir, placeholder: "<runner-state>" });
  }
  const home = os.homedir();
  if (home) {
    targets.push({ rawPath: home, placeholder: "<user-home>" });
  }

  return redactPhysicalPaths(stripped, targets);
}

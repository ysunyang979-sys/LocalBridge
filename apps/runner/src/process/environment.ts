import fs from "node:fs";
import path from "node:path";

const WINDOWS_ENV_ALLOWLIST = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "COMSPEC",
]);

const POSIX_ENV_ALLOWLIST = new Set([
  "PATH",
  "LANG",
  "LC_ALL",
  "TMPDIR",
]);

/**
 * Builds a hardened, stripped environment for subprocess execution.
 * - Uses a minimal system allowlist (PATH, SystemRoot/WINDIR on Windows, LANG on POSIX).
 * - Strips all parent environment secrets (API keys, runner tokens, etc.).
 * - Points HOME / USERPROFILE / XDG directories to an isolated `execution-home/` sandbox.
 * - Sets PYTHONNOUSERSITE=1 to prevent loading untrusted local user site packages.
 */
export function buildSafeProcessEnv(
  runnerStateDir: string,
  extraEnv?: Record<string, string>
): NodeJS.ProcessEnv {
  const isWindows = process.platform === "win32";
  const allowlist = isWindows ? WINDOWS_ENV_ALLOWLIST : POSIX_ENV_ALLOWLIST;

  const executionHome = path.join(runnerStateDir, "execution-home");
  if (!fs.existsSync(executionHome)) {
    try {
      fs.mkdirSync(executionHome, { recursive: true });
    } catch {
      // Ignore if exists
    }
  }

  const safeEnv: NodeJS.ProcessEnv = {};

  // Copy only allowlisted variables from host environment
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const normalizedKey = key.toUpperCase();
    if (allowlist.has(normalizedKey)) {
      safeEnv[key] = value;
    }
  }

  // Override user homes and config paths to point to isolated execution-home
  safeEnv["HOME"] = executionHome;
  safeEnv["USERPROFILE"] = executionHome;
  safeEnv["XDG_CONFIG_HOME"] = path.join(executionHome, ".config");
  safeEnv["XDG_DATA_HOME"] = path.join(executionHome, ".local", "share");
  safeEnv["XDG_CACHE_HOME"] = path.join(executionHome, ".cache");
  safeEnv["NPM_CONFIG_USERCONFIG"] = path.join(executionHome, ".npmrc");

  // Prevent Python from importing scripts from user's global site-packages directory
  safeEnv["PYTHONNOUSERSITE"] = "1";

  // Prevent interactive CLI prompts
  safeEnv["CI"] = "1";

  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      safeEnv[k] = v;
    }
  }

  return safeEnv;
}

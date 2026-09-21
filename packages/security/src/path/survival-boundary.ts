import os from "node:os";
import path from "node:path";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { SecurityPathError } from "./errors.js";
import { isPathInside } from "./resolver.js";

/**
 * Validates whether a target path violates the Nexus Control Plane Survival Boundary.
 * Even under Device Full Control mode, AI tools are strictly forbidden from deleting,
 * overwriting, or corrupting:
 * 1. Root filesystems / volume roots (e.g. C:\, D:\, /)
 * 2. Operating System critical roots (e.g. C:\Windows, C:\Windows\System32)
 * 3. Nexus process executable (process.execPath)
 * 4. Nexus state, database, secrets, and configuration directories (.localbridge, etc.)
 */
export function isSurvivalBoundaryViolation(targetPath: string, customStateDir?: string): boolean {
  const normTarget = path.resolve(targetPath);
  const targetLower = process.platform === "win32" ? normTarget.toLowerCase() : normTarget;

  // 1. Root volume check
  const parsed = path.parse(normTarget);
  if (parsed.root && (normTarget === parsed.root || normTarget === parsed.root.replace(/[\\/]$/, ""))) {
    return true;
  }

  // 2. Nexus executable check
  if (process.execPath) {
    const execLower = process.platform === "win32" ? path.resolve(process.execPath).toLowerCase() : path.resolve(process.execPath);
    if (targetLower === execLower) {
      return true;
    }
  }

  // 3. LocalBridge State Directory check (~/.localbridge or customStateDir)
  const homeStateDir = path.join(os.homedir(), ".localbridge");
  if (isPathInside(homeStateDir, normTarget) || normTarget === path.resolve(homeStateDir)) {
    return true;
  }
  if (customStateDir) {
    if (isPathInside(customStateDir, normTarget) || normTarget === path.resolve(customStateDir)) {
      return true;
    }
  }

  // 4. Critical control plane file basenames
  const baseLower = path.basename(normTarget).toLowerCase();
  if (
    baseLower === "projects.json" ||
    baseLower === "tunnel_credentials.json" ||
    baseLower === "localbridge.db" ||
    baseLower === "nexus.db" ||
    baseLower === "auth_tokens.json"
  ) {
    if (normTarget.includes(".localbridge") || normTarget.includes(".nexus")) {
      return true;
    }
  }

  // 5. Windows OS Protection
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
    const sysRootNorm = path.resolve(systemRoot);
    if (isPathInside(sysRootNorm, normTarget) || normTarget === sysRootNorm) {
      return true;
    }
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const nexusAppDir = path.join(programFiles, "LocalBridge");
    if (isPathInside(nexusAppDir, normTarget) || normTarget === path.resolve(nexusAppDir)) {
      return true;
    }
  } else {
    // Unix OS protection: /bin, /sbin, /usr, /etc, /lib, /sys, /proc, /dev, /boot
    const unixProtected = ["/bin", "/sbin", "/usr", "/etc", "/lib", "/sys", "/proc", "/dev", "/boot"];
    for (const p of unixProtected) {
      if (isPathInside(p, normTarget) || normTarget === p) {
        return true;
      }
    }
  }

  return false;
}

export function assertSurvivalBoundarySafe(targetPath: string, customStateDir?: string): void {
  if (isSurvivalBoundaryViolation(targetPath, customStateDir)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      `Access to control plane or system survival path "${targetPath}" is strictly protected and forbidden.`
    );
  }
}

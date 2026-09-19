import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ResolvedExecutable } from "./types.js";

export class ExecutableRegistry {
  private readonly cache = new Map<string, ResolvedExecutable>();

  constructor(private readonly logger?: Logger) {}

  /**
   * Resolve an absolute executable on host system PATH.
   * Caches successful lookups in memory.
   * Throws COMMAND_TOOL_NOT_AVAILABLE if the tool cannot be found or executed.
   */
  async getExecutable(tool: "node" | "npm" | "pnpm" | "python"): Promise<ResolvedExecutable> {
    const cached = this.cache.get(tool);
    if (cached) {
      return cached;
    }

    this.logger?.debug({ tool }, "Probing host executable on PATH");
    const resolved = await this.probeExecutable(tool);
    this.cache.set(tool, resolved);
    this.logger?.debug({ tool, resolved }, "Resolved host executable");
    return resolved;
  }

  /**
   * Check whether an executable is available without throwing.
   */
  async hasExecutable(tool: "node" | "npm" | "pnpm" | "python"): Promise<boolean> {
    try {
      await this.getExecutable(tool);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached resolved executables (useful for testing or dynamic environment changes).
   */
  clearCache(): void {
    this.cache.clear();
  }

  private async probeExecutable(tool: "node" | "npm" | "pnpm" | "python"): Promise<ResolvedExecutable> {
    const isWindows = process.platform === "win32";

    if (tool === "node") {
      let nodeExe = this.findBinaryOnPath("node", isWindows ? [".exe"] : []);
      // If node is not on system PATH, fall back to current bundled runtime
      if (!nodeExe && process.execPath && fs.existsSync(process.execPath)) {
        nodeExe = process.execPath;
      }
      if (!nodeExe) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
          "Node.js executable ('node') is not available on Runner host system PATH"
        );
      }
      const version = this.probeVersion(nodeExe, ["--version"]);
      return { tool: "node", executablePath: nodeExe, version };
    }

    if (tool === "python") {
      // Look for python, python3, or py
      const candidates = isWindows
        ? ["python", "python3", "py"]
        : ["python3", "python"];
      let pythonExe: string | null = null;

      for (const name of candidates) {
        const found = this.findBinaryOnPath(name, isWindows ? [".exe"] : []);
        if (found) {
          // On Windows, Microsoft Store stub in WindowsApps may exist but exit with 9009 or error.
          // Test if it runs:
          const version = this.tryProbeVersion(found, ["--version"]);
          if (version) {
            pythonExe = found;
            return { tool: "python", executablePath: pythonExe, version };
          }
        }
      }

      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
        "Python executable ('python' / 'python3') is not available or working on Runner host system PATH"
      );
    }

    if (tool === "npm" || tool === "pnpm") {
      if (isWindows) {
        return this.probeWindowsJsPackageTool(tool);
      } else {
        const binPath = this.findBinaryOnPath(tool, []);
        if (!binPath) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
            `Package manager '${tool}' is not available on Runner host system PATH`
          );
        }
        const version = this.probeVersion(binPath, ["--version"]);
        return { tool, executablePath: binPath, version };
      }
    }

    throw new LocalBridgeError(
      LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
      `Unsupported tool: ${tool}`
    );
  }

  private probeWindowsJsPackageTool(tool: "npm" | "pnpm"): ResolvedExecutable {
    // 1. Check for standalone .exe first
    const exe = this.findBinaryOnPath(tool, [".exe"]);
    if (exe) {
      const version = this.tryProbeVersion(exe, ["--version"]);
      if (version) {
        return { tool, executablePath: exe, version };
      }
    }

    // 2. Locate node executable first so we can run the tool via node directly (bypassing cmd.exe)
    const nodeExe = this.findBinaryOnPath("node", [".exe"]);
    if (!nodeExe) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
        `Cannot execute '${tool}' because 'node.exe' was not found on Runner host system PATH`
      );
    }

    // 3. Find .cmd file on PATH
    const cmdFile = this.findBinaryOnPath(tool, [".cmd", ".bat"]);
    let jsEntrypoint: string | null = null;

    if (cmdFile) {
      jsEntrypoint = this.extractJsFromCmd(cmdFile, tool);
    }

    // Also check standard global node_modules locations if not found via cmd file
    if (!jsEntrypoint) {
      const nodeDir = path.dirname(nodeExe);
      if (tool === "npm") {
        const candidate = path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
        if (fs.existsSync(candidate)) jsEntrypoint = candidate;
      } else if (tool === "pnpm") {
        const candidate = path.join(nodeDir, "node_modules", "pnpm", "bin", "pnpm.cjs");
        if (fs.existsSync(candidate)) jsEntrypoint = candidate;
      }
    }

    if (!jsEntrypoint) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
        `Package manager '${tool}' is not available on Runner host system PATH`
      );
    }

    const version = this.probeVersion(nodeExe, [jsEntrypoint, "--version"]);
    return {
      tool,
      executablePath: nodeExe,
      prependArgs: [jsEntrypoint],
      version,
    };
  }

  private extractJsFromCmd(cmdPath: string, tool: "npm" | "pnpm"): string | null {
    try {
      const cmdDir = path.dirname(cmdPath);
      // Fast path: standard node_modules structure relative to cmd
      if (tool === "npm") {
        const standard = path.join(cmdDir, "node_modules", "npm", "bin", "npm-cli.js");
        if (fs.existsSync(standard)) return standard;
      } else {
        const standard1 = path.join(cmdDir, "node_modules", "pnpm", "bin", "pnpm.cjs");
        if (fs.existsSync(standard1)) return standard1;
        const standard2 = path.join(cmdDir, "node_modules", "pnpm", "dist", "pnpm.cjs");
        if (fs.existsSync(standard2)) return standard2;
      }

      // Regex parse cmd content for referenced .js or .cjs
      const content = fs.readFileSync(cmdPath, "utf-8");
      const match = content.match(/"([^"]+\.(?:c?js))"/i);
      if (match && match[1]) {
        let resolvedPath = match[1].replace(/%dp0%/gi, cmdDir);
        if (!path.isAbsolute(resolvedPath)) {
          resolvedPath = path.resolve(cmdDir, resolvedPath);
        }
        if (fs.existsSync(resolvedPath)) {
          return resolvedPath;
        }
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }

  private findBinaryOnPath(name: string, extensions: string[]): string | null {
    const rawPath = process.env.PATH || "";
    const delimiter = path.delimiter;
    const pathDirs = rawPath
      .split(delimiter)
      .map((d) => d.trim().replace(/^"|"$/g, ""))
      .filter((d) => Boolean(d) && d !== "." && path.isAbsolute(d));

    for (const dir of pathDirs) {
      if (extensions.length === 0) {
        const candidate = path.join(dir, name);
        if (this.isExecutableFile(candidate)) {
          return candidate;
        }
      } else {
        for (const ext of extensions) {
          const candidate = path.join(dir, `${name}${ext}`);
          if (this.isExecutableFile(candidate)) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  private isExecutableFile(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) return false;
      const stat = fs.statSync(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private probeVersion(executable: string, args: string[]): string {
    const version = this.tryProbeVersion(executable, args);
    if (!version) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
        `Executable at '${executable}' failed version check`
      );
    }
    return version;
  }

  private tryProbeVersion(executable: string, args: string[]): string | null {
    try {
      const result = child_process.spawnSync(executable, args, {
        timeout: 3000,
        encoding: "utf-8",
        windowsHide: true,
        shell: false,
      });
      if (result.status === 0 && result.stdout) {
        const firstLine = result.stdout.trim().split(/\r?\n/)[0];
        return firstLine ? firstLine.replace(/^[a-zA-Z\s]+version\s+/i, "").trim() : null;
      }
      return null;
    } catch {
      return null;
    }
  }
}

import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type DetectedTool,
  type EnvironmentDetectResult,
  type ToolCategory,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ResolvedExecutable } from "./types.js";

export interface ToolCatalogEntry {
  tool: string;
  category: ToolCategory;
  binaryNames: string[];
  versionArgs: string[];
  versionParser?: (stdout: string, stderr: string) => string | null;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  // JavaScript / TypeScript
  { tool: "node", category: "javascript", binaryNames: ["node"], versionArgs: ["--version"] },
  { tool: "npm", category: "javascript", binaryNames: ["npm"], versionArgs: ["--version"] },
  { tool: "pnpm", category: "javascript", binaryNames: ["pnpm"], versionArgs: ["--version"] },
  { tool: "yarn", category: "javascript", binaryNames: ["yarn"], versionArgs: ["--version"] },
  { tool: "bun", category: "javascript", binaryNames: ["bun"], versionArgs: ["--version"] },
  { tool: "deno", category: "javascript", binaryNames: ["deno"], versionArgs: ["--version"] },

  // Python
  {
    tool: "python",
    category: "python",
    binaryNames: process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"],
    versionArgs: ["--version"],
    versionParser: (out, err) => {
      const match = (out || err).match(/Python\s+([^\s]+)/i);
      return match ? match[1]! : (out || err).trim().split(/\r?\n/)[0] || null;
    },
  },
  {
    tool: "pip",
    category: "python",
    binaryNames: process.platform === "win32" ? ["pip", "pip3"] : ["pip3", "pip"],
    versionArgs: ["--version"],
  },
  { tool: "uv", category: "python", binaryNames: ["uv"], versionArgs: ["--version"] },

  // JVM
  {
    tool: "java",
    category: "jvm",
    binaryNames: ["java"],
    versionArgs: ["-version"],
    versionParser: (out, err) => {
      const text = err || out;
      const match = text.match(/(?:version\s+"([^"]+)"|openjdk\s+([^\s]+))/i);
      return match ? match[1] || match[2] || null : text.trim().split(/\r?\n/)[0] || null;
    },
  },
  {
    tool: "javac",
    category: "jvm",
    binaryNames: ["javac"],
    versionArgs: ["-version"],
    versionParser: (out, err) => (out || err).replace(/^javac\s+/i, "").trim().split(/\r?\n/)[0] || null,
  },
  { tool: "mvn", category: "jvm", binaryNames: ["mvn"], versionArgs: ["--version"] },
  { tool: "gradle", category: "jvm", binaryNames: ["gradle"], versionArgs: ["--version"] },

  // Go
  {
    tool: "go",
    category: "go",
    binaryNames: ["go"],
    versionArgs: ["version"],
    versionParser: (out) => {
      const match = out.match(/go version\s+(go[^\s]+)/i);
      return match ? match[1]! : out.trim().split(/\r?\n/)[0] || null;
    },
  },

  // Rust
  {
    tool: "rustc",
    category: "rust",
    binaryNames: ["rustc"],
    versionArgs: ["--version"],
    versionParser: (out) => {
      const match = out.match(/rustc\s+([^\s]+)/i);
      return match ? match[1]! : out.trim().split(/\r?\n/)[0] || null;
    },
  },
  {
    tool: "cargo",
    category: "rust",
    binaryNames: ["cargo"],
    versionArgs: ["--version"],
    versionParser: (out) => {
      const match = out.match(/cargo\s+([^\s]+)/i);
      return match ? match[1]! : out.trim().split(/\r?\n/)[0] || null;
    },
  },

  // PHP
  { tool: "php", category: "php", binaryNames: ["php"], versionArgs: ["--version"] },
  { tool: "composer", category: "php", binaryNames: ["composer"], versionArgs: ["--version"] },

  // Ruby
  { tool: "ruby", category: "ruby", binaryNames: ["ruby"], versionArgs: ["--version"] },
  { tool: "gem", category: "ruby", binaryNames: ["gem"], versionArgs: ["--version"] },

  // .NET
  { tool: "dotnet", category: "dotnet", binaryNames: ["dotnet"], versionArgs: ["--version"] },

  // C / C++
  { tool: "gcc", category: "cpp", binaryNames: ["gcc"], versionArgs: ["--version"] },
  { tool: "g++", category: "cpp", binaryNames: ["g++"], versionArgs: ["--version"] },
  { tool: "clang", category: "cpp", binaryNames: ["clang"], versionArgs: ["--version"] },
  { tool: "cmake", category: "cpp", binaryNames: ["cmake"], versionArgs: ["--version"] },

  // Shells
  { tool: "pwsh", category: "shell", binaryNames: ["pwsh"], versionArgs: ["--version"] },
  {
    tool: "powershell",
    category: "shell",
    binaryNames: ["powershell"],
    versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
    versionParser: (out) => out.trim().split(/\r?\n/)[0] || null,
  },

  // Container
  {
    tool: "docker",
    category: "container",
    binaryNames: ["docker"],
    versionArgs: ["--version"],
    versionParser: (out) => {
      const match = out.match(/Docker version\s+([^\s,]+)/i);
      return match ? match[1]! : out.trim().split(/\r?\n/)[0] || null;
    },
  },

  // VCS
  { tool: "git", category: "vcs", binaryNames: ["git"], versionArgs: ["--version"] },
];

export class ExecutableRegistry {
  private readonly cache = new Map<string, ResolvedExecutable>();

  constructor(private readonly logger?: Logger) {}

  /**
   * Resolve an absolute executable on host system PATH.
   * Caches successful lookups in memory.
   * Throws COMMAND_TOOL_NOT_AVAILABLE if the tool cannot be found or executed.
   */
  async getExecutable(tool: string): Promise<ResolvedExecutable> {
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
  async hasExecutable(tool: string): Promise<boolean> {
    try {
      await this.getExecutable(tool);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Perform environment detection across standard development runtimes and tools.
   * Never throws, returns installed status (true/false) for each checked tool.
   */
  async detectEnvironment(filterTools?: string[]): Promise<EnvironmentDetectResult> {
    const detectedTools: DetectedTool[] = [];

    if (filterTools && filterTools.length > 0) {
      for (const requestedTool of filterTools) {
        const lower = requestedTool.toLowerCase();
        if (lower === "docker compose" || lower === "compose") {
          const dockerPath = this.findBinaryOnPath("docker");
          const composeVersion = dockerPath ? this.tryProbeVersion(dockerPath, ["compose", "version"]) : null;
          detectedTools.push({
            tool: requestedTool,
            category: "container",
            installed: Boolean(composeVersion),
            version: composeVersion,
            path: dockerPath,
          });
          continue;
        }

        const entry = TOOL_CATALOG.find((c) => c.tool.toLowerCase() === lower);
        if (entry) {
          const probeResult = await this.probeToolMetadata(entry);
          detectedTools.push(probeResult);
        } else {
          // Ad-hoc tool probe on PATH
          const binPath = this.findBinaryOnPath(requestedTool);
          const version = binPath ? this.tryProbeVersion(binPath, ["--version", "-v", "version"]) : null;
          detectedTools.push({
            tool: requestedTool,
            category: "shell",
            installed: Boolean(binPath),
            version,
            path: binPath,
          });
        }
      }
    } else {
      for (const entry of TOOL_CATALOG) {
        const probeResult = await this.probeToolMetadata(entry);
        detectedTools.push(probeResult);
      }

      // Check docker compose
      const dockerTool = detectedTools.find((t) => t.tool === "docker");
      if (dockerTool && dockerTool.installed && dockerTool.path) {
        const composeVersion = this.tryProbeVersion(dockerTool.path, ["compose", "version"]);
        detectedTools.push({
          tool: "docker compose",
          category: "container",
          installed: Boolean(composeVersion),
          version: composeVersion,
          path: dockerTool.path,
        });
      } else {
        detectedTools.push({
          tool: "docker compose",
          category: "container",
          installed: false,
          version: null,
          path: null,
        });
      }
    }

    return {
      platform: process.platform,
      arch: process.arch,
      tools: detectedTools,
    };
  }

  /**
   * Clear cached resolved executables (useful for testing or dynamic environment changes).
   */
  clearCache(): void {
    this.cache.clear();
  }

  private async probeToolMetadata(entry: ToolCatalogEntry): Promise<DetectedTool> {
    try {
      const resolved = await this.probeExecutable(entry.tool);
      return {
        tool: entry.tool,
        category: entry.category,
        installed: true,
        version: resolved.version,
        path: resolved.executablePath,
      };
    } catch {
      return {
        tool: entry.tool,
        category: entry.category,
        installed: false,
        version: null,
        path: null,
      };
    }
  }

  private async probeExecutable(tool: string): Promise<ResolvedExecutable> {
    const isWindows = process.platform === "win32";

    if (tool === "node") {
      let nodeExe = this.findBinaryOnPath("node");
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
      const candidates = isWindows ? ["python", "python3", "py"] : ["python3", "python"];
      for (const name of candidates) {
        const found = this.findBinaryOnPath(name);
        if (found) {
          const version = this.tryProbeVersion(found, ["--version"]);
          if (version) {
            return { tool: "python", executablePath: found, version };
          }
        }
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
        "Python executable ('python' / 'python3') is not available or working on Runner host system PATH"
      );
    }

    if (tool === "npm" || tool === "pnpm" || tool === "yarn") {
      if (isWindows) {
        return this.probeWindowsJsPackageTool(tool as "npm" | "pnpm" | "yarn");
      }
    }

    // Check catalog entry
    const catalogEntry = TOOL_CATALOG.find((c) => c.tool.toLowerCase() === tool.toLowerCase());
    const binaryCandidates = catalogEntry ? catalogEntry.binaryNames : [tool];
    const versionArgs = catalogEntry ? catalogEntry.versionArgs : ["--version"];
    const versionParser = catalogEntry?.versionParser;

    for (const name of binaryCandidates) {
      const found = this.findBinaryOnPath(name);
      if (found) {
        const version = this.tryProbeVersionWithParser(found, versionArgs, versionParser);
        if (version !== null) {
          return { tool, executablePath: found, version };
        }
      }
    }

    throw new LocalBridgeError(
      LocalBridgeErrorCode.COMMAND_TOOL_NOT_AVAILABLE,
      `Executable '${tool}' is not available on Runner host system PATH`
    );
  }

  private probeWindowsJsPackageTool(tool: "npm" | "pnpm" | "yarn"): ResolvedExecutable {
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
      } else if (tool === "yarn") {
        const candidate = path.join(nodeDir, "node_modules", "yarn", "bin", "yarn.js");
        if (fs.existsSync(candidate)) jsEntrypoint = candidate;
      }
    }

    if (!jsEntrypoint) {
      // Fallback: If .cmd exists and cannot extract js, execute the .cmd directly
      if (cmdFile) {
        const version = this.tryProbeVersion(cmdFile, ["--version"]);
        if (version) {
          return { tool, executablePath: cmdFile, version };
        }
      }
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

  private extractJsFromCmd(cmdPath: string, tool: "npm" | "pnpm" | "yarn"): string | null {
    try {
      const cmdDir = path.dirname(cmdPath);
      // Fast path: standard node_modules structure relative to cmd
      if (tool === "npm") {
        const standard = path.join(cmdDir, "node_modules", "npm", "bin", "npm-cli.js");
        if (fs.existsSync(standard)) return standard;
      } else if (tool === "pnpm") {
        const standard1 = path.join(cmdDir, "node_modules", "pnpm", "bin", "pnpm.cjs");
        if (fs.existsSync(standard1)) return standard1;
        const standard2 = path.join(cmdDir, "node_modules", "pnpm", "dist", "pnpm.cjs");
        if (fs.existsSync(standard2)) return standard2;
      } else if (tool === "yarn") {
        const standard = path.join(cmdDir, "node_modules", "yarn", "bin", "yarn.js");
        if (fs.existsSync(standard)) return standard;
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

  findBinaryOnPath(name: string, extensions?: string[]): string | null {
    const isWindows = process.platform === "win32";
    const exts = extensions ?? (isWindows ? this.getWindowsPathExt() : [""]);
    const rawPath = process.env.PATH || "";
    const delimiter = path.delimiter;
    const pathDirs = rawPath
      .split(delimiter)
      .map((d) => d.trim().replace(/^"|"$/g, ""))
      .filter((d) => Boolean(d) && d !== "." && path.isAbsolute(d));

    for (const dir of pathDirs) {
      if (path.extname(name)) {
        const candidate = path.join(dir, name);
        if (this.isExecutableFile(candidate)) {
          return candidate;
        }
      }

      for (const ext of exts) {
        const candidate = path.join(dir, `${name}${ext}`);
        if (this.isExecutableFile(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  private getWindowsPathExt(): string[] {
    const raw = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.PS1";
    const exts = raw
      .split(";")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return exts.length > 0 ? exts : [".exe", ".cmd", ".bat", ".com"];
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
    return this.tryProbeVersionWithParser(executable, args);
  }

  private tryProbeVersionWithParser(
    executable: string,
    args: string[],
    parser?: (stdout: string, stderr: string) => string | null
  ): string | null {
    try {
      const result = child_process.spawnSync(executable, args, {
        timeout: 4000,
        encoding: "utf-8",
        windowsHide: true,
        shell: false,
      });

      const stdout = result.stdout || "";
      const stderr = result.stderr || "";

      if (parser) {
        const parsed = parser(stdout, stderr);
        if (parsed) return parsed;
      }

      if (result.status === 0 && stdout) {
        const firstLine = stdout.trim().split(/\r?\n/)[0];
        return firstLine ? firstLine.replace(/^[a-zA-Z\s]+version\s+/i, "").trim() : null;
      }
      if (result.status === 0 && stderr) {
        const firstLine = stderr.trim().split(/\r?\n/)[0];
        return firstLine ? firstLine.replace(/^[a-zA-Z\s]+version\s+/i, "").trim() : null;
      }
      return null;
    } catch {
      return null;
    }
  }
}

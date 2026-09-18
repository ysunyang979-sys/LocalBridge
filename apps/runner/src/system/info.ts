import os from "node:os";
import child_process from "node:child_process";
import type { RunnerSystemInfo, RunnerTools } from "@localbridge/protocol";

export function probeToolVersion(command: string, args: string[] = ["--version"]): string | undefined {
  try {
    const fullCmd = `${command} ${args.join(" ")}`;
    const output = child_process.execSync(fullCmd, {
      timeout: 1500,
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf-8",
      windowsHide: true,
    });
    const firstLine = output.trim().split(/\r?\n/)[0];
    return firstLine ? firstLine.replace(/^[a-zA-Z\s]+version\s+/i, "").trim() : undefined;
  } catch {
    return undefined;
  }
}

export function detectTools(): RunnerTools {
  return {
    git: probeToolVersion("git", ["--version"]),
    node: probeToolVersion("node", ["-v"]),
    npm: probeToolVersion("npm", ["-v"]),
    pnpm: probeToolVersion("pnpm", ["-v"]),
    python: probeToolVersion("python", ["--version"]) || probeToolVersion("python3", ["--version"]),
    docker: probeToolVersion("docker", ["--version"]),
  };
}

export function collectSystemInfo(): RunnerSystemInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    nodeVersion: process.version,
    tools: detectTools(),
  };
}

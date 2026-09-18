export interface ResolvedExecutable {
  tool: "node" | "npm" | "pnpm" | "python";
  executablePath: string;
  prependArgs?: string[];
  version: string;
}

export interface ProcessSpawnOptions {
  executablePath: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBufferBytes?: number;
  maxTotalBytes?: number;
  canonicalProjectRoot?: string;
  runnerStateDir?: string;
}

export interface ProcessExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 60000;
export const MIN_COMMAND_TIMEOUT_MS = 1000;
export const MAX_COMMAND_TIMEOUT_MS = 300000;

export const MAX_COMMAND_STDOUT_BYTES = 256 * 1024; // 256 KiB
export const MAX_COMMAND_STDERR_BYTES = 256 * 1024; // 256 KiB
export const MAX_COMMAND_TOTAL_BYTES = 512 * 1024; // 512 KiB

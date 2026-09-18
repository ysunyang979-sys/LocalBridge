export interface GitSpawnOptions {
  cwd: string;
  args: string[];
  timeoutMs?: number;
  maxBufferBytes?: number;
  isDiff?: boolean;
}

export interface GitSpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitRepoValidationResult {
  isRepository: boolean;
  worktreeRoot: string;
}

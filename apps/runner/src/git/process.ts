import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { GitSpawnOptions, GitSpawnResult } from "./types.js";
import { mapGitProcessError, sanitizeGitErrorMessage } from "./errors.js";

export const DEFAULT_GIT_TIMEOUT_MS = 10000;
export const MAX_GIT_TIMEOUT_MS = 30000;
export const DEFAULT_GIT_MAX_BUFFER_BYTES = 512 * 1024; // 512 KiB
export const MAX_GIT_DIFF_BYTES = 256 * 1024; // 256 KiB

export class GitProcessRunner {
  private readonly emptyHooksDir: string;
  private gitAvailableCache: boolean | null = null;

  constructor(private readonly logger?: Logger) {
    this.emptyHooksDir = path.join(os.tmpdir(), "localbridge-empty-hooks");
    if (!fs.existsSync(this.emptyHooksDir)) {
      try {
        fs.mkdirSync(this.emptyHooksDir, { recursive: true });
      } catch {
        // Ignore if exists
      }
    }
  }

  /**
   * Verify whether the `git` binary is available on the host system PATH.
   */
  async checkGitAvailable(): Promise<boolean> {
    if (this.gitAvailableCache !== null) {
      return this.gitAvailableCache;
    }

    try {
      const result = await this.spawnDirect({
        cwd: process.cwd(),
        args: ["--version"],
        timeoutMs: 3000,
      });
      this.gitAvailableCache = result.exitCode === 0;
    } catch {
      this.gitAvailableCache = false;
    }

    return this.gitAvailableCache;
  }

  /**
   * Ensure Git is available; throws GIT_NOT_AVAILABLE if absent.
   */
  async assertGitAvailable(): Promise<void> {
    const available = await this.checkGitAvailable();
    if (!available) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.GIT_NOT_AVAILABLE,
        "Git is not installed or not available on the Runner system PATH"
      );
    }
  }

  /**
   * Execute git command with hardened security arguments, timeout, and output bounds.
   */
  async exec(options: GitSpawnOptions): Promise<GitSpawnResult> {
    await this.assertGitAvailable();

    const timeoutMs = Math.min(
      options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
      MAX_GIT_TIMEOUT_MS
    );
    const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_GIT_MAX_BUFFER_BYTES;

    // Hardened base arguments prepended to every Git execution:
    // - Disable pagers
    // - Disable fsmonitor hooks
    // - Disable external diff tools
    // - Isolate hooks to empty directory
    const hardenedArgs = [
      "--no-pager",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "diff.external=",
      "-c",
      `core.hooksPath=${this.emptyHooksDir}`,
      ...options.args,
    ];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "cat",
      PAGER: "cat",
      GIT_CONFIG_NOSYSTEM: "1",
    };

    return new Promise<GitSpawnResult>((resolve, reject) => {
      let child: child_process.ChildProcess;

      try {
        child = child_process.spawn("git", hardenedArgs, {
          cwd: options.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          env,
          shell: false, // Strictly direct process execution - NO shell interpolation
          windowsHide: true,
        });
      } catch (err) {
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.GIT_NOT_AVAILABLE,
            `Failed to spawn git process: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        return;
      }

      let stdoutBytes = 0;
      const stdoutChunks: Buffer[] = [];
      let stderrBytes = 0;
      const stderrChunks: Buffer[] = [];
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.GIT_TIMEOUT,
            `Git command timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxBufferBytes) {
          killed = true;
          clearTimeout(timer);
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }

          const errorCode = options.isDiff
            ? LocalBridgeErrorCode.GIT_DIFF_TOO_LARGE
            : LocalBridgeErrorCode.GIT_OUTPUT_TOO_LARGE;

          reject(
            new LocalBridgeError(
              errorCode,
              `Git output exceeded maximum limit of ${maxBufferBytes} bytes`
            )
          );
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes <= 64 * 1024) {
          stderrChunks.push(chunk);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        if (killed) return;
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.GIT_PROCESS_FAILED,
            `Git process error: ${err.message}`
          )
        );
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (killed) return;

        const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        const exitCode = code ?? 0;

        if (exitCode !== 0 && !options.allowNonZeroExit) {
          this.logger?.debug(
            {
              event: "git_process_error",
              exitCode,
              stderr: sanitizeGitErrorMessage(stderr, options.cwd),
            },
            `Git process failed with exit code ${exitCode}`
          );
          reject(mapGitProcessError(stderr, exitCode, options.cwd));
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode,
        });
      });
    });
  }

  /**
   * Internal direct spawner without prepending hardened base arguments (used for --version check).
   */
  private spawnDirect(options: GitSpawnOptions): Promise<GitSpawnResult> {
    return new Promise<GitSpawnResult>((resolve, reject) => {
      const child = child_process.spawn("git", options.args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_PAGER: "cat",
          PAGER: "cat",
        },
        shell: false,
        windowsHide: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on("data", (c) => stdoutChunks.push(c));
      child.stderr?.on("data", (c) => stderrChunks.push(c));

      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
          stderr: Buffer.concat(stderrChunks).toString("utf-8"),
          exitCode: code ?? 0,
        });
      });
    });
  }
}

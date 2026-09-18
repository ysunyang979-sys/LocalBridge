import child_process from "node:child_process";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  MIN_COMMAND_TIMEOUT_MS,
  MAX_COMMAND_TIMEOUT_MS,
  MAX_COMMAND_STDOUT_BYTES,
  MAX_COMMAND_STDERR_BYTES,
  MAX_COMMAND_TOTAL_BYTES,
  type ProcessSpawnOptions,
  type ProcessExecutionResult,
} from "./types.js";
import { killProcessTree } from "./kill-tree.js";
import { sanitizeProcessOutput } from "./output.js";

export class ProcessRunner {
  constructor(private readonly logger?: Logger) {}

  /**
   * Spawns a subprocess with strict resource bounds, timeout, process tree kill on violation,
   * and output sanitization.
   */
  async run(options: ProcessSpawnOptions): Promise<ProcessExecutionResult> {
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS, MIN_COMMAND_TIMEOUT_MS),
      MAX_COMMAND_TIMEOUT_MS
    );
    const maxBufferBytes = options.maxBufferBytes ?? MAX_COMMAND_STDOUT_BYTES;
    const maxTotalBytes = options.maxTotalBytes ?? MAX_COMMAND_TOTAL_BYTES;

    const startTime = Date.now();
    this.logger?.debug(
      { executable: options.executablePath, args: options.args, cwd: options.cwd, timeoutMs },
      "Spawning command process"
    );

    return new Promise<ProcessExecutionResult>((resolve, reject) => {
      let child: child_process.ChildProcess;

      try {
        child = child_process.spawn(options.executablePath, options.args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false, // CRITICAL: strictly direct execution, never a subshell
          windowsHide: true,
        });
      } catch (err) {
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_EXECUTION_FAILED,
            `Failed to spawn command process: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        return;
      }

      let stdoutBytes = 0;
      const stdoutChunks: Buffer[] = [];
      let stderrBytes = 0;
      const stderrChunks: Buffer[] = [];
      let killed = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanupAndKill = async (errorCode: LocalBridgeErrorCode, message: string) => {
        if (killed) return;
        killed = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        if (child.pid) {
          try {
            await killProcessTree(child.pid);
          } catch {
            // Ignore kill errors
          }
        }

        this.logger?.warn({ pid: child.pid, errorCode, message }, "Command aborted due to limit violation or timeout");
        reject(new LocalBridgeError(errorCode, message));
      };

      timer = setTimeout(() => {
        cleanupAndKill(
          LocalBridgeErrorCode.COMMAND_TIMEOUT,
          `Command process timed out after ${timeoutMs}ms`
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (killed) return;
        stdoutBytes += chunk.length;

        if (stdoutBytes > maxBufferBytes) {
          cleanupAndKill(
            LocalBridgeErrorCode.COMMAND_OUTPUT_TOO_LARGE,
            `Command stdout exceeded maximum limit of ${maxBufferBytes} bytes`
          );
          return;
        }

        if (stdoutBytes + stderrBytes > maxTotalBytes) {
          cleanupAndKill(
            LocalBridgeErrorCode.COMMAND_OUTPUT_TOO_LARGE,
            `Combined command output exceeded maximum limit of ${maxTotalBytes} bytes`
          );
          return;
        }

        stdoutChunks.push(chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (killed) return;
        stderrBytes += chunk.length;

        if (stderrBytes > (options.maxBufferBytes ?? MAX_COMMAND_STDERR_BYTES)) {
          cleanupAndKill(
            LocalBridgeErrorCode.COMMAND_OUTPUT_TOO_LARGE,
            `Command stderr exceeded maximum limit of ${options.maxBufferBytes ?? MAX_COMMAND_STDERR_BYTES} bytes`
          );
          return;
        }

        if (stdoutBytes + stderrBytes > maxTotalBytes) {
          cleanupAndKill(
            LocalBridgeErrorCode.COMMAND_OUTPUT_TOO_LARGE,
            `Combined command output exceeded maximum limit of ${maxTotalBytes} bytes`
          );
          return;
        }

        stderrChunks.push(chunk);
      });

      child.on("error", (err) => {
        if (killed) return;
        if (timer) clearTimeout(timer);
        killed = true;
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_EXECUTION_FAILED,
            `Process execution error: ${err.message}`
          )
        );
      });

      child.on("close", (code) => {
        if (killed) return;
        if (timer) clearTimeout(timer);
        killed = true;

        const durationMs = Date.now() - startTime;
        const rawStdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const rawStderr = Buffer.concat(stderrChunks).toString("utf-8");

        const stdout = sanitizeProcessOutput(
          rawStdout,
          options.canonicalProjectRoot,
          options.runnerStateDir
        );
        const stderr = sanitizeProcessOutput(
          rawStderr,
          options.canonicalProjectRoot,
          options.runnerStateDir
        );

        this.logger?.debug(
          { exitCode: code, durationMs, stdoutBytes, stderrBytes },
          "Command execution finished"
        );

        resolve({
          exitCode: code ?? 0,
          stdout,
          stderr,
          durationMs,
          timedOut: false,
          outputTruncated: false,
        });
      });
    });
  }
}

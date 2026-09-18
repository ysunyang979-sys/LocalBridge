import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

export interface AtomicWriteOptions {
  mode?: number;
}

/**
 * Atomically writes data to targetPath using a sibling temporary file, fsync, and atomic rename.
 * Cleans up temporary file on failure.
 */
export function atomicWriteFile(
  targetPath: string,
  data: Buffer | string,
  options?: AtomicWriteOptions
): void {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tempPath = path.join(
    dir,
    `.${base}.localbridge-${crypto.randomBytes(8).toString("hex")}.tmp`
  );

  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  const mode = options?.mode ?? 0o644;

  let fd: number | null = null;
  try {
    fd = fs.openSync(
      tempPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      mode
    );
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    if (options?.mode !== undefined && process.platform !== "win32") {
      try {
        fs.chmodSync(tempPath, options.mode);
      } catch {
        // Ignore chmod errors if filesystem does not support it
      }
    }

    fs.renameSync(tempPath, targetPath);
  } catch (err: unknown) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }

    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup error
      }
    }

    const error = err as NodeJS.ErrnoException;
    if (error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_BUSY,
        `File is currently locked or access was denied: ${error.code}`
      );
    }

    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_WRITE_FAILED,
      `Failed to write file atomically: ${error.message || String(err)}`
    );
  }
}

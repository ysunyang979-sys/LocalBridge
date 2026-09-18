import fs from "node:fs";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";

const PROBE_BUFFER_SIZE = 8192; // 8 KiB

/**
 * Probes the initial bytes of an open file descriptor to detect binary content
 * (presence of NUL bytes) and verify strict UTF-8 decodability.
 */
export function probeBinaryAndEncoding(fd: number, fileSize: number): void {
  if (fileSize === 0) {
    return;
  }

  const bytesToRead = Math.min(fileSize, PROBE_BUFFER_SIZE);
  const buffer = Buffer.alloc(bytesToRead);
  const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, 0);

  const slice = buffer.subarray(0, bytesRead);

  // 1. NUL byte check (standard binary file detector)
  if (slice.includes(0x00)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.BINARY_FILE,
      "Binary files are not supported"
    );
  }

  // 2. Strict UTF-8 validation of probe slice
  // Note: if the 8KB boundary falls in the middle of a multi-byte UTF-8 sequence,
  // we trim up to 3 trailing continuation bytes for the probe check.
  let validSliceLength = bytesRead;
  if (bytesRead < fileSize) {
    while (
      validSliceLength > 0 &&
      (slice[validSliceLength - 1]! & 0xc0) === 0x80
    ) {
      validSliceLength--;
    }
    if (
      validSliceLength > 0 &&
      (slice[validSliceLength - 1]! & 0x80) !== 0
    ) {
      validSliceLength--;
    }
  }

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(slice.subarray(0, validSliceLength));
  } catch {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_ENCODING_UNSUPPORTED,
      "Unsupported text encoding; file contains invalid UTF-8 sequences"
    );
  }
}

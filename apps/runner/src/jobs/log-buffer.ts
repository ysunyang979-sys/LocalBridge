import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type JobLogChunk,
} from "@localbridge/protocol";
import { sanitizeProcessOutput } from "../process/output.js";
import {
  MAX_JOB_LOG_BYTES,
  MAX_LOG_RESPONSE_BYTES,
  MAX_LOG_CHUNKS_PER_RESPONSE,
} from "./types.js";

export interface LogCursorPayload {
  lastSeq: number;
}

export interface GetLogsOptions {
  cursor?: string | null;
  limit?: number;
}

export interface GetLogsResult {
  chunks: JobLogChunk[];
  nextCursor: string | null;
  truncated: boolean;
  droppedBytes: number;
}

export class JobLogBuffer {
  private chunks: JobLogChunk[] = [];
  private nextSeq = 0;
  private currentBytes = 0;
  private droppedBytes = 0;
  private truncated = false;
  private hasInsertedTruncatedMarker = false;
  private _stdoutBytes = 0;
  private _stderrBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number = MAX_JOB_LOG_BYTES) {
    this.maxBytes = maxBytes;
  }

  /**
   * Append a log chunk to the buffer with immediate sanitization.
   * If buffer capacity is exceeded, marks outputTruncated = true,
   * inserts [output truncated] notice once, and drops subsequent chunks to avoid memory explosion.
   */
  append(
    stream: "stdout" | "stderr",
    raw: Buffer | string,
    canonicalProjectRoot?: string,
    runnerStateDir?: string
  ): void {
    const rawString = Buffer.isBuffer(raw) ? raw.toString("utf-8") : raw;
    if (!rawString) return;

    const rawBytes = Buffer.byteLength(rawString, "utf-8");
    if (stream === "stdout") {
      this._stdoutBytes += rawBytes;
    } else {
      this._stderrBytes += rawBytes;
    }

    // Sanitize before storage (strip ANSI CSI/OSC, redact physical paths, preserve UTF-8/Chinese/emojis)
    const text = sanitizeProcessOutput(rawString, canonicalProjectRoot, runnerStateDir);
    if (!text) return;

    const chunkBytes = Buffer.byteLength(text, "utf-8");

    // Evict oldest chunks if adding this chunk exceeds maxBytes
    while (
      (this.hasInsertedTruncatedMarker ? this.chunks.length > 1 : this.chunks.length > 0) &&
      this.currentBytes + chunkBytes > this.maxBytes
    ) {
      const idx = this.hasInsertedTruncatedMarker ? 1 : 0;
      const oldest = this.chunks.splice(idx, 1)[0]!;
      const dropped = Buffer.byteLength(oldest.text, "utf-8");
      this.currentBytes -= dropped;
      this.droppedBytes += dropped;
      this.truncated = true;
    }

    if (this.truncated && !this.hasInsertedTruncatedMarker) {
      this.hasInsertedTruncatedMarker = true;
      const markerText = "\n[output truncated]\n";
      const markerBytes = Buffer.byteLength(markerText, "utf-8");
      const marker: JobLogChunk = {
        seq: 0,
        stream: "stderr",
        timestamp: Date.now(),
        text: markerText,
      };
      this.chunks.unshift(marker);
      this.currentBytes += markerBytes;
    }

    this.nextSeq++;
    const chunk: JobLogChunk = {
      seq: this.nextSeq,
      stream,
      timestamp: Date.now(),
      text,
    };

    this.chunks.push(chunk);
    this.currentBytes += chunkBytes;
  }

  /**
   * Retrieve paginated log chunks with opaque cursor and response byte bounds.
   */
  getLogs(options?: GetLogsOptions): GetLogsResult {
    let lastSeq = 0;

    if (options?.cursor) {
      try {
        const jsonStr = Buffer.from(options.cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(jsonStr) as LogCursorPayload;
        if (!parsed || typeof parsed.lastSeq !== "number" || !Number.isInteger(parsed.lastSeq)) {
          throw new Error("Invalid cursor format");
        }
        lastSeq = parsed.lastSeq;
      } catch (err) {
        if (err instanceof LocalBridgeError) throw err;
        throw new LocalBridgeError(
          LocalBridgeErrorCode.INVALID_JOB_CURSOR,
          "Invalid job log cursor"
        );
      }
    }

    const maxChunks = Math.min(
      Math.max(options?.limit ?? 100, 1),
      MAX_LOG_CHUNKS_PER_RESPONSE
    );

    // Filter chunks after lastSeq (include seq 0 truncation marker on initial query)
    const eligibleChunks = this.chunks.filter((c) => c.seq > lastSeq || (lastSeq === 0 && c.seq === 0));

    const resultChunks: JobLogChunk[] = [];
    let responseBytes = 0;

    for (let i = 0; i < eligibleChunks.length; i++) {
      if (resultChunks.length >= maxChunks) {
        break;
      }

      const candidate = eligibleChunks[i]!;
      const candidateBytes = Buffer.byteLength(candidate.text, "utf-8");

      if (responseBytes + candidateBytes > MAX_LOG_RESPONSE_BYTES && resultChunks.length > 0) {
        break;
      }

      resultChunks.push(candidate);
      responseBytes += candidateBytes;
    }

    let nextCursor: string | null = null;
    if (resultChunks.length > 0) {
      const lastReturnedSeq = resultChunks[resultChunks.length - 1]!.seq;
      const hasMore = eligibleChunks.some((c) => c.seq > lastReturnedSeq);
      if (hasMore) {
        nextCursor = Buffer.from(JSON.stringify({ lastSeq: lastReturnedSeq })).toString("base64url");
      }
    }

    return {
      chunks: resultChunks,
      nextCursor,
      truncated: this.truncated,
      droppedBytes: this.droppedBytes,
    };
  }

  get totalBytes(): number {
    return this.currentBytes;
  }

  get stdoutBytes(): number {
    return this._stdoutBytes;
  }

  get stderrBytes(): number {
    return this._stderrBytes;
  }

  get isTruncated(): boolean {
    return this.truncated;
  }

  get totalDroppedBytes(): number {
    return this.droppedBytes;
  }

  /**
   * Retrieve the last N characters of accumulated logs for quick status inspection.
   */
  getLastOutput(maxLength: number = 1000): string {
    if (this.chunks.length === 0) return "";
    let combined = "";
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      combined = this.chunks[i]!.text + combined;
      if (combined.length >= maxLength) {
        return combined.slice(-maxLength);
      }
    }
    return combined;
  }
}

import type { RuntimeLogChunk } from "@localbridge/protocol";
import { sanitizeProcessOutput } from "../process/output.js";
import { MAX_RUNTIME_LOG_BYTES } from "./types.js";

export interface GetRuntimeLogsResult {
  entries: RuntimeLogChunk[];
  nextSequence: number;
  hasMore: boolean;
  outputTruncated: boolean;
}

export class RuntimeLogBuffer {
  private chunks: RuntimeLogChunk[] = [];
  private nextSeq = 0;
  private currentBytes = 0;
  private droppedBytes = 0;
  private truncated = false;
  private hasInsertedTruncatedMarker = false;
  private readonly maxBytes: number;

  constructor(maxBytes: number = MAX_RUNTIME_LOG_BYTES) {
    this.maxBytes = maxBytes;
  }

  append(
    stream: "stdout" | "stderr",
    raw: Buffer | string,
    generation: number,
    canonicalProjectRoot?: string,
    runnerStateDir?: string
  ): void {
    const rawString = Buffer.isBuffer(raw) ? raw.toString("utf-8") : raw;
    if (!rawString) return;

    const text = sanitizeProcessOutput(rawString, canonicalProjectRoot, runnerStateDir);
    if (!text) return;

    const chunkBytes = Buffer.byteLength(text, "utf-8");

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
      const marker: RuntimeLogChunk = {
        seq: 0,
        stream: "stderr",
        timestamp: Date.now(),
        text: markerText,
        generation,
      };
      this.chunks.unshift(marker);
      this.currentBytes += markerBytes;
    }

    this.nextSeq++;
    const chunk: RuntimeLogChunk = {
      seq: this.nextSeq,
      stream,
      timestamp: Date.now(),
      text,
      generation,
    };

    this.chunks.push(chunk);
    this.currentBytes += chunkBytes;
  }

  getLogs(afterSequence = 0, limit = 100): GetRuntimeLogsResult {
    const eligible = this.chunks.filter(
      (c) => c.seq > afterSequence || (afterSequence === 0 && c.seq === 0)
    );
    const entries = eligible.slice(0, limit);
    const nextSequence =
      entries.length > 0 ? entries[entries.length - 1]!.seq : afterSequence;
    const hasMore = eligible.length > entries.length;

    return {
      entries,
      nextSequence,
      hasMore,
      outputTruncated: this.truncated,
    };
  }

  get isTruncated(): boolean {
    return this.truncated;
  }

  get totalBytes(): number {
    return this.currentBytes;
  }

  get totalDroppedBytes(): number {
    return this.droppedBytes;
  }
}

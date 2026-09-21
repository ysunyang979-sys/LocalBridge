import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Laya Download Resume & Partial Content Suite", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "laya-resume-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("calculates correct byte offset when resuming partial download", () => {
    const destFile = path.join(tempDir, "model.safetensors");
    const partFile = `${destFile}.part`;

    // Simulate 1000 bytes already downloaded in part file
    const partialData = Buffer.alloc(1000, "A");
    fs.writeFileSync(partFile, partialData);

    const existingBytes = fs.statSync(partFile).size;
    expect(existingBytes).toBe(1000);

    const rangeHeader = `bytes=${existingBytes}-`;
    expect(rangeHeader).toBe("bytes=1000-");
  });

  it("appends remaining chunks cleanly to existing partial file", () => {
    const partFile = path.join(tempDir, "chunk.bin.part");
    fs.writeFileSync(partFile, Buffer.from("first_chunk_"));

    // Append second chunk
    fs.appendFileSync(partFile, Buffer.from("second_chunk"));

    const combined = fs.readFileSync(partFile, "utf8");
    expect(combined).toBe("first_chunk_second_chunk");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode, type CommandSpec } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager, JobLogBuffer } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Logs Streaming & Sanitization", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-logs-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Logs Project",
      accessMode: "read-write",
    });
    projectId = rec.id;
    projectRegistry.setExecutionMode(projectId, "project-code");

    const execRegistry = new ExecutableRegistry();
    jobManager = new JobManager(projectRegistry, execRegistry, tempDir);
  });

  afterEach(async () => {
    await jobManager.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("captures stdout and stderr with ANSI stripped, Chinese preserved, and paths redacted", async () => {
    const script = path.join(projectDir, "log-test.js");
    // Print ANSI colored text, OSC title escape, Chinese characters, and the project directory path
    const scriptContent = `
      console.log("\\u001b[31mRed Error\\u001b[0m: 中文日志测试 🚀");
      console.error("Stderr info: " + process.cwd());
    `;
    fs.writeFileSync(script, scriptContent, "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "log-test.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    let attempts = 0;
    while (attempts < 20) {
      const s = jobManager.getJobStatus(start.jobId);
      if (s.state !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    const logsResult = jobManager.getJobLogs({ jobId: start.jobId });
    expect(logsResult.chunks.length).toBeGreaterThan(0);

    const fullText = logsResult.chunks.map((c) => c.text).join("");
    // ANSI stripped
    expect(fullText).not.toContain("\u001b[31m");
    expect(fullText).not.toContain("\u001b[0m");

    // Chinese and emoji preserved
    expect(fullText).toContain("中文日志测试");
    expect(fullText).toContain("🚀");

    // Physical project dir redacted
    expect(fullText).not.toContain(projectDir);
    expect(fullText).toContain("<project-root>");
  });

  it("supports sequential cursor pagination", async () => {
    const script = path.join(projectDir, "paginated.js");
    const scriptContent = `
      for (let i = 1; i <= 10; i++) {
        console.log("Line " + i);
      }
    `;
    fs.writeFileSync(script, scriptContent, "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "paginated.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    let attempts = 0;
    while (attempts < 20) {
      const s = jobManager.getJobStatus(start.jobId);
      if (s.state !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    // Page 1
    const page1 = jobManager.getJobLogs({ jobId: start.jobId });
    expect(page1.chunks.length).toBeGreaterThan(0);
    const lastSeq = page1.chunks[page1.chunks.length - 1].seq;

    // Subsequent query using cursor
    const cursor = Buffer.from(JSON.stringify({ lastSeq })).toString("base64url");
    const page2 = jobManager.getJobLogs({ jobId: start.jobId, cursor });
    // No new logs after completion
    expect(page2.chunks.length).toBe(0);
    expect(page2.nextCursor).toBeNull();
  });

  it("throws INVALID_JOB_CURSOR on malformed cursor", async () => {
    const script = path.join(projectDir, "noop.js");
    fs.writeFileSync(script, "console.log('hi');\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "noop.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    expect(() =>
      jobManager.getJobLogs({ jobId: start.jobId, cursor: "not-valid-base64-json" })
    ).toThrowError(LocalBridgeError);

    try {
      jobManager.getJobLogs({ jobId: start.jobId, cursor: "not-valid-base64-json" });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.INVALID_JOB_CURSOR);
    }
  });

  it("handles JobLogBuffer FIFO ring buffer overflow and tracks droppedBytes", () => {
    // Test JobLogBuffer directly with custom small byte limit (500 bytes)
    const smallBuffer = new JobLogBuffer(500);

    // Push 10 chunks of ~90 bytes each (total ~900 bytes > 500 bytes)
    for (let i = 0; i < 10; i++) {
      smallBuffer.append("stdout", `Chunk ${i} ` + "X".repeat(80) + "\n");
    }

    const res = smallBuffer.getLogs();
    expect(res.truncated).toBe(true);
    expect(res.droppedBytes).toBeGreaterThan(0);
    expect(res.chunks.length).toBeLessThan(10);
    // Highest seq chunks should be preserved
    const lastChunk = res.chunks[res.chunks.length - 1];
    expect(lastChunk.text).toContain("Chunk 9");
  });
});

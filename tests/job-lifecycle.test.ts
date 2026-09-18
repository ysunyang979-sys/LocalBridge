import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { type CommandSpec } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Lifecycle States", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-life-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Lifecycle Project",
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

  it("handles succeeded job with exitCode 0", async () => {
    const script = path.join(projectDir, "ok.js");
    fs.writeFileSync(script, "console.log('hello world'); process.exit(0);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "ok.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    let attempts = 0;
    let finalStatus;
    while (attempts < 20) {
      finalStatus = jobManager.getJobStatus(start.jobId);
      if (finalStatus.state !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    expect(finalStatus?.state).toBe("succeeded");
    expect(finalStatus?.exitCode).toBe(0);
    expect(finalStatus?.signal).toBeNull();
    expect(finalStatus?.finishedAt).toBeGreaterThanOrEqual(finalStatus?.createdAt || 0);
  });

  it("handles failed job with non-zero exitCode", async () => {
    const script = path.join(projectDir, "fail.js");
    fs.writeFileSync(script, "console.error('fatal error'); process.exit(42);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "fail.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    let attempts = 0;
    let finalStatus;
    while (attempts < 20) {
      finalStatus = jobManager.getJobStatus(start.jobId);
      if (finalStatus.state !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    expect(finalStatus?.state).toBe("failed");
    expect(finalStatus?.exitCode).toBe(42);
    expect(finalStatus?.finishedAt).toBeDefined();
  });

  it("handles cancelled job and idempotent cancel calls", async () => {
    const script = path.join(projectDir, "long.js");
    fs.writeFileSync(script, "setTimeout(() => {}, 10000);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "long.js",
        args: [],
        cwd: ".",
        timeoutMs: 10000,
      },
    });

    expect(start.state).toBe("running");

    // 1. Cancel active job
    const cancel1 = await jobManager.cancelJob(start.jobId);
    expect(cancel1.jobId).toBe(start.jobId);
    expect(cancel1.state).toBe("cancelled");
    expect(cancel1.alreadyTerminal).toBe(false);

    const statusAfterCancel = jobManager.getJobStatus(start.jobId);
    expect(statusAfterCancel.state).toBe("cancelled");

    // 2. Cancel again -> idempotent, returns alreadyTerminal: true
    const cancel2 = await jobManager.cancelJob(start.jobId);
    expect(cancel2.jobId).toBe(start.jobId);
    expect(cancel2.state).toBe("cancelled");
    expect(cancel2.alreadyTerminal).toBe(true);
  });
});

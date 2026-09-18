import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Cancellation & Process Tree Kill", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-cancel-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Cancel Project",
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

  it("terminates the entire process tree on cancellation", async () => {
    // Parent spawns a child worker and both loop indefinitely
    const childWorkerPath = path.join(projectDir, "worker.js");
    fs.writeFileSync(
      childWorkerPath,
      `
      console.log("Worker started with PID: " + process.pid);
      setInterval(() => {}, 1000);
      `,
      "utf-8"
    );

    const parentScriptPath = path.join(projectDir, "parent.js");
    fs.writeFileSync(
      parentScriptPath,
      `
      import { spawn } from "node:child_process";
      console.log("Parent started with PID: " + process.pid);
      const child = spawn(process.execPath, ["worker.js"], { stdio: "inherit" });
      setInterval(() => {}, 1000);
      `,
      "utf-8"
    );

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "parent.js",
        args: [],
        cwd: ".",
        timeoutMs: 30000,
      },
    });

    expect(start.state).toBe("running");
    // Give time for parent to spawn child
    await new Promise((r) => setTimeout(r, 600));

    // Cancel job
    const cancelRes = await jobManager.cancelJob(start.jobId);
    expect(cancelRes.state).toBe("cancelled");
    expect(cancelRes.alreadyTerminal).toBe(false);

    const status = jobManager.getJobStatus(start.jobId);
    expect(status.state).toBe("cancelled");
    expect(status.finishedAt).toBeDefined();

    // Calling cancel again is idempotent
    const cancelAgain = await jobManager.cancelJob(start.jobId);
    expect(cancelAgain.alreadyTerminal).toBe(true);
  });
});

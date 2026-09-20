import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Timeout & Process Tree Kill", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-timeout-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Timeout Project",
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

  it("transitions to timed-out and terminates process tree when execution exceeds timeoutMs", async () => {
    const script = path.join(projectDir, "hang.js");
    fs.writeFileSync(
      script,
      `
      console.log("Hang script started");
      setInterval(() => {
        console.log("Still hanging...");
      }, 500);
      `,
      "utf-8"
    );

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "hang.js",
        args: [],
        cwd: ".",
      },
      timeoutMs: 1000, // 1 second timeout
    });

    expect(start.state).toBe("running");

    // Poll until timeout is reached
    let attempts = 0;
    let finalStatus;
    while (attempts < 30) {
      finalStatus = jobManager.getJobStatus(start.jobId);
      if (finalStatus.state !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    expect(["timed-out", "timed_out"]).toContain(finalStatus?.state);
    expect(finalStatus?.finishedAt).toBeDefined();

    const logs = jobManager.getJobLogs({ jobId: start.jobId });
    const fullLogText = logs.chunks.map((c) => c.text).join("");
    expect(fullLogText).toContain("timed out");
  });
});

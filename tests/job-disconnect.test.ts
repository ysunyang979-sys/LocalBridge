import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Runner Ownership & Disconnect Continuity", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-disc-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Disconnect Project",
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

  it("ensures job runs to completion locally even when network/caller is simulated disconnected", async () => {
    // A script that writes a marker file after 300ms
    const markerFile = path.join(projectDir, "finished.marker");
    const script = path.join(projectDir, "long-job.js");
    fs.writeFileSync(
      script,
      `
      import fs from "node:fs";
      setTimeout(() => {
        fs.writeFileSync("${markerFile.replace(/\\/g, "/")}", "success", "utf-8");
        console.log("Job finished successfully");
      }, 300);
      `,
      "utf-8"
    );

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "long-job.js",
        args: [],
        cwd: ".",
        timeoutMs: 10000,
      },
    });

    expect(start.state).toBe("running");

    // Simulate caller or network disconnect by simply not querying and waiting
    await new Promise((r) => setTimeout(r, 600));

    // Job continued running in the runner background and completed
    expect(fs.existsSync(markerFile)).toBe(true);

    // Reconnecting caller queries job status and logs
    const status = jobManager.getJobStatus(start.jobId);
    expect(status.state).toBe("succeeded");
    expect(status.exitCode).toBe(0);

    const logs = jobManager.getJobLogs({ jobId: start.jobId });
    const fullLog = logs.chunks.map((c) => c.text).join("");
    expect(fullLog).toContain("Job finished successfully");
  });
});

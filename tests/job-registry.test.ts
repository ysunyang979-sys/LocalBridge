import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode, type CommandSpec } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Registry & Identity", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-reg-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Job Test Project",
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

  it("assigns unique job_<UUIDv4> format and starts in running state", async () => {
    const scriptPath = path.join(projectDir, "quick.js");
    fs.writeFileSync(scriptPath, "setTimeout(() => console.log('done'), 100);\n", "utf-8");

    const command: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "quick.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    const startResult = await jobManager.startJob({ command });
    expect(startResult.jobId).toMatch(/^job_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(startResult.state).toBe("running");
    expect(typeof startResult.createdAt).toBe("number");

    // Check status immediately
    const status = jobManager.getJobStatus(startResult.jobId);
    expect(status.jobId).toBe(startResult.jobId);
    expect(status.projectId).toBe(projectId);
    expect(status.state).toBe("running");

    // Wait for completion
    await new Promise((r) => setTimeout(r, 400));
    const finishedStatus = jobManager.getJobStatus(startResult.jobId);
    expect(finishedStatus.state).toBe("succeeded");
    expect(finishedStatus.exitCode).toBe(0);
    expect(finishedStatus.finishedAt).toBeDefined();
    expect(typeof finishedStatus.finishedAt).toBe("number");
  });

  it("throws JOB_NOT_FOUND when requesting non-existent jobId", () => {
    expect(() => jobManager.getJobStatus("job_non_existent")).toThrowError(LocalBridgeError);
    try {
      jobManager.getJobStatus("job_non_existent");
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.JOB_NOT_FOUND);
    }
  });

  it("lists active and recent jobs filtered by projectId or state", async () => {
    const script1 = path.join(projectDir, "s1.js");
    fs.writeFileSync(script1, "console.log('s1');\n", "utf-8");

    const res1 = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "s1.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    await new Promise((r) => setTimeout(r, 300));

    const listAll = jobManager.listJobs({});
    expect(listAll.jobs.length).toBeGreaterThanOrEqual(1);
    const found = listAll.jobs.find((j) => j.jobId === res1.jobId);
    expect(found).toBeDefined();
    expect(found?.state).toBe("succeeded");

    const filteredByProj = jobManager.listJobs({ projectId });
    expect(filteredByProj.jobs.some((j) => j.jobId === res1.jobId)).toBe(true);

    const filteredByUnknownProj = jobManager.listJobs({ projectId: "proj_unknown" });
    expect(filteredByUnknownProj.jobs.length).toBe(0);
  });
});

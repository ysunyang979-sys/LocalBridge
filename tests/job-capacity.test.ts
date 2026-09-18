import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode, type CommandSpec } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Concurrency & Rate Limits", () => {
  let tempDir: string;
  let registryPath: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let project1Id: string;
  let project2Id: string;
  let project3Id: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-cap-test-"));
    registryPath = path.join(tempDir, "projects.json");

    const p1Dir = path.join(tempDir, "proj1");
    const p2Dir = path.join(tempDir, "proj2");
    const p3Dir = path.join(tempDir, "proj3");
    fs.mkdirSync(p1Dir, { recursive: true });
    fs.mkdirSync(p2Dir, { recursive: true });
    fs.mkdirSync(p3Dir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec1 = projectRegistry.add(p1Dir, { name: "P1", accessMode: "read-write" });
    const rec2 = projectRegistry.add(p2Dir, { name: "P2", accessMode: "read-write" });
    const rec3 = projectRegistry.add(p3Dir, { name: "P3", accessMode: "read-write" });
    project1Id = rec1.id;
    project2Id = rec2.id;
    project3Id = rec3.id;

    projectRegistry.setExecutionMode(project1Id, "project-code");
    projectRegistry.setExecutionMode(project2Id, "project-code");
    projectRegistry.setExecutionMode(project3Id, "project-code");

    // create a sleeping script in each project
    const sleepScript = "setTimeout(() => {}, 5000);\n";
    fs.writeFileSync(path.join(p1Dir, "sleep.js"), sleepScript, "utf-8");
    fs.writeFileSync(path.join(p2Dir, "sleep.js"), sleepScript, "utf-8");
    fs.writeFileSync(path.join(p3Dir, "sleep.js"), sleepScript, "utf-8");

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

  it("enforces MAX_RUNNING_JOBS_PER_PROJECT = 2", async () => {
    const spec: CommandSpec = {
      kind: "node-script",
      projectId: project1Id,
      path: "sleep.js",
      args: [],
      cwd: ".",
      timeoutMs: 10000,
    };

    const j1 = await jobManager.startJob({ command: spec });
    const j2 = await jobManager.startJob({ command: spec });
    expect(j1.state).toBe("running");
    expect(j2.state).toBe("running");

    // 3rd job on project1 must throw JOB_CAPACITY_EXCEEDED
    await expect(jobManager.startJob({ command: spec })).rejects.toThrowError(LocalBridgeError);
    try {
      await jobManager.startJob({ command: spec });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.JOB_CAPACITY_EXCEEDED);
    }
  });

  it("enforces MAX_RUNNING_JOBS_PER_RUNNER = 4 across projects", async () => {
    // 2 in project 1
    await jobManager.startJob({
      command: { kind: "node-script", projectId: project1Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 10000 },
    });
    await jobManager.startJob({
      command: { kind: "node-script", projectId: project1Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 10000 },
    });

    // 2 in project 2 (total = 4)
    await jobManager.startJob({
      command: { kind: "node-script", projectId: project2Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 10000 },
    });
    await jobManager.startJob({
      command: { kind: "node-script", projectId: project2Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 10000 },
    });

    // 5th job in project 3 must fail due to runner capacity
    await expect(
      jobManager.startJob({
        command: { kind: "node-script", projectId: project3Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 10000 },
      })
    ).rejects.toThrowError(LocalBridgeError);

    try {
      await jobManager.startJob({
        command: { kind: "node-script", projectId: project3Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 10000 },
      });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.JOB_CAPACITY_EXCEEDED);
    }
  });

  it("releases capacity when a job is cancelled or completes", async () => {
    const spec: CommandSpec = {
      kind: "node-script",
      projectId: project1Id,
      path: "sleep.js",
      args: [],
      cwd: ".",
      timeoutMs: 10000,
    };

    const j1 = await jobManager.startJob({ command: spec });
    const j2 = await jobManager.startJob({ command: spec });

    // Cancel j1
    await jobManager.cancelJob(j1.jobId);

    // Now starting a new job on project1 succeeds
    const j3 = await jobManager.startJob({ command: spec });
    expect(j3.state).toBe("running");
  });

  it("enforces MAX_JOB_STARTS_PER_MINUTE = 20 rate limit", async () => {
    // We already have startTimestamps in jobManager. We can simulate 20 starts
    const fastScript = "console.log('done');\n";
    fs.writeFileSync(path.join(tempDir, "proj1", "fast.js"), fastScript, "utf-8");

    const spec: CommandSpec = {
      kind: "node-script",
      projectId: project1Id,
      path: "fast.js",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    };

    // Run 20 rapid sequential jobs (waiting for each to finish so concurrency cap is not hit)
    for (let i = 0; i < 20; i++) {
      const j = await jobManager.startJob({ command: spec });
      // wait for terminal
      let attempts = 0;
      while (attempts < 20) {
        const s = jobManager.getJobStatus(j.jobId);
        if (s.state !== "running") break;
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }
    }

    // 21st start within the minute must throw JOB_RATE_LIMITED
    await expect(jobManager.startJob({ command: spec })).rejects.toThrowError(LocalBridgeError);
    try {
      await jobManager.startJob({ command: spec });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.JOB_RATE_LIMITED);
    }
  });
});

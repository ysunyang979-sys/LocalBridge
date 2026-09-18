import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - Job Project Revocation & Permission Downgrade", () => {
  let tempDir: string;
  let registryPath: string;
  let p1Dir: string;
  let p2Dir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let p1Id: string;
  let p2Id: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-job-revoc-test-"));
    registryPath = path.join(tempDir, "projects.json");
    p1Dir = path.join(tempDir, "p1");
    p2Dir = path.join(tempDir, "p2");
    fs.mkdirSync(p1Dir, { recursive: true });
    fs.mkdirSync(p2Dir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec1 = projectRegistry.add(p1Dir, { name: "P1", accessMode: "read-write" });
    const rec2 = projectRegistry.add(p2Dir, { name: "P2", accessMode: "read-write" });
    p1Id = rec1.id;
    p2Id = rec2.id;
    projectRegistry.setExecutionMode(p1Id, "project-code");
    projectRegistry.setExecutionMode(p2Id, "project-code");

    // create a sleeping script in each project
    const sleepScript = "setInterval(() => {}, 1000);\n";
    fs.writeFileSync(path.join(p1Dir, "sleep.js"), sleepScript, "utf-8");
    fs.writeFileSync(path.join(p2Dir, "sleep.js"), sleepScript, "utf-8");

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

  it("immediately cancels running jobs when project is removed", async () => {
    const j1 = await jobManager.startJob({
      command: { kind: "node-script", projectId: p1Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 30000 },
    });
    const j2 = await jobManager.startJob({
      command: { kind: "node-script", projectId: p2Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 30000 },
    });

    expect(j1.state).toBe("running");
    expect(j2.state).toBe("running");

    // Remove P1
    projectRegistry.remove(p1Id);

    // Give a brief tick for event handler to cancel
    await new Promise((r) => setTimeout(r, 100));

    const s1 = jobManager.getJobStatus(j1.jobId);
    const s2 = jobManager.getJobStatus(j2.jobId);

    expect(s1.state).toBe("cancelled");
    expect(s2.state).toBe("running");
  });

  it("immediately cancels running jobs when project is disabled", async () => {
    const j1 = await jobManager.startJob({
      command: { kind: "node-script", projectId: p1Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 30000 },
    });

    expect(j1.state).toBe("running");

    // Disable P1
    projectRegistry.disable(p1Id);

    await new Promise((r) => setTimeout(r, 100));

    const s1 = jobManager.getJobStatus(j1.jobId);
    expect(s1.state).toBe("cancelled");
  });

  it("immediately cancels running jobs when project executionMode is downgraded", async () => {
    const j1 = await jobManager.startJob({
      command: { kind: "node-script", projectId: p1Id, path: "sleep.js", args: [], cwd: ".", timeoutMs: 30000 },
    });

    expect(j1.state).toBe("running");

    // Downgrade to safe-only
    projectRegistry.setExecutionMode(p1Id, "safe-only");

    await new Promise((r) => setTimeout(r, 100));

    const s1 = jobManager.getJobStatus(j1.jobId);
    expect(s1.state).toBe("cancelled");
  });
});

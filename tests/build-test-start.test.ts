import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";

describe("Phase 9 - High-Level build.start and test.start Wrappers", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-build-test-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Build Test Project",
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

  it("throws BUILD_SCRIPT_NOT_FOUND when package.json does not exist or lacks script", async () => {
    // No package.json yet
    await expect(
      jobManager.startBuild({ projectId, script: "build" })
    ).rejects.toThrowError(LocalBridgeError);

    try {
      await jobManager.startBuild({ projectId, script: "build" });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND);
    }

    // Write package.json without "build" script
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "demo", scripts: { other: "node -v" } }, null, 2),
      "utf-8"
    );

    await expect(
      jobManager.startBuild({ projectId, script: "build" })
    ).rejects.toThrowError(LocalBridgeError);

    try {
      await jobManager.startBuild({ projectId, script: "build" });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND);
    }
  });

  it("throws TEST_SCRIPT_NOT_FOUND when package.json does not exist or lacks script", async () => {
    await expect(
      jobManager.startTest({ projectId, script: "test" })
    ).rejects.toThrowError(LocalBridgeError);

    try {
      await jobManager.startTest({ projectId, script: "test" });
    } catch (err) {
      expect((err as LocalBridgeError).code).toBe(LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND);
    }
  });

  it("enforces permission bounds: blocks build.start and test.start when safe-only or read-only", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "demo", scripts: { build: "node -v", test: "node -v" } }, null, 2),
      "utf-8"
    );

    // 1. In safe-only mode
    projectRegistry.setExecutionMode(projectId, "safe-only");
    await expect(jobManager.startBuild({ projectId, script: "build" })).rejects.toThrowError(LocalBridgeError);
    await expect(jobManager.startTest({ projectId, script: "test" })).rejects.toThrowError(LocalBridgeError);

    // 2. In read-only access mode
    projectRegistry.setExecutionMode(projectId, "project-code");
    projectRegistry.setAccessMode(projectId, "read-only");
    await expect(jobManager.startBuild({ projectId, script: "build" })).rejects.toThrowError(LocalBridgeError);
    await expect(jobManager.startTest({ projectId, script: "test" })).rejects.toThrowError(LocalBridgeError);
  });

  it("successfully starts build and test background jobs when authorized", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: {
          build: "node -e \"console.log('building artifacts')\"",
          test: "node -e \"console.log('running test suite')\"",
        },
      }, null, 2),
      "utf-8"
    );

    const buildRes = await jobManager.startBuild({ projectId, script: "build" });
    expect(buildRes.jobId).toMatch(/^job_/);
    expect(buildRes.state).toBe("running");

    const testRes = await jobManager.startTest({ projectId, script: "test" });
    expect(testRes.jobId).toMatch(/^job_/);
    expect(testRes.state).toBe("running");

    // Wait for both to finish
    await new Promise((r) => setTimeout(r, 600));

    const buildStatus = jobManager.getJobStatus(buildRes.jobId);
    expect(buildStatus.state).toBe("succeeded");
    expect(buildStatus.exitCode).toBe(0);

    const testStatus = jobManager.getJobStatus(testRes.jobId);
    expect(testStatus.state).toBe("succeeded");
    expect(testStatus.exitCode).toBe(0);
  });
});

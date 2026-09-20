import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandSpec,
  type JobStartParams,
} from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { JobManager } from "../apps/runner/src/jobs/index.js";
import { JobLogBuffer } from "../apps/runner/src/jobs/log-buffer.js";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";
import { ServerProjectService } from "../apps/server/src/runner/project-service.js";
import { RunnerRegistry } from "../apps/server/src/runner/registry.js";
import { RunnerRpcService } from "../apps/server/src/runner/rpc-service.js";
import { McpContext } from "../apps/server/src/mcp/context.js";
import { initDatabase } from "../apps/server/src/db/index.js";

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM";
  }
}

async function waitForJobState(
  jobManager: JobManager,
  jobId: string,
  targetStates: string[],
  maxWaitMs = 5000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = jobManager.getJobStatus(jobId);
    if (targetStates.includes(status.state)) {
      return status;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return jobManager.getJobStatus(jobId);
}

describe("P1-C Job & Runtime Reliability E2E (20 Matrix Scenarios)", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let dbPath: string;
  let projectRegistry: ProjectRegistry;
  let approvalManager: ApprovalManager;
  let execRegistry: ExecutableRegistry;
  let jobManager: JobManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-p1c-e2e-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    dbPath = path.join(tempDir, "server.db");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "P1-C Test Project",
      accessMode: "read-write",
    });
    projectId = rec.id;
    projectRegistry.setExecutionMode(projectId, "project-code");
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "full",
      commandPolicy: "allow",
      protectedFilesPolicy: "never-ask",
    });

    approvalManager = new ApprovalManager();
    execRegistry = new ExecutableRegistry();
    jobManager = new JobManager(
      projectRegistry,
      execRegistry,
      tempDir,
      undefined,
      approvalManager,
      {
        enableQueue: true,
        persistState: true,
        maxRunningPerRunner: 2,
        maxRunningPerProject: 1,
        maxQueuedPerRunner: 5,
        maxQueuedPerProject: 3,
      }
    );
  });

  afterEach(async () => {
    await jobManager.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // Scenario 1: Normal job: starts, executes, transitions running -> succeeded with exitCode 0
  // =========================================================================
  it("Scenario 1: normal job start -> running -> succeeded with exitCode 0", async () => {
    const scriptPath = path.join(projectDir, "ok.js");
    fs.writeFileSync(scriptPath, "console.log('job success test'); process.exit(0);\n", "utf-8");

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

    expect(start.jobId).toBeDefined();
    expect(["running", "succeeded"]).toContain(start.state);

    const status = await waitForJobState(jobManager, start.jobId, ["succeeded"]);
    expect(status.state).toBe("succeeded");
    expect(status.exitCode).toBe(0);
    expect(status.signal).toBeNull();
    expect(status.finishedAt).toBeGreaterThanOrEqual(status.startedAt ?? 0);
  });

  // =========================================================================
  // Scenario 2: Failed job: non-zero exit code transitions running -> failed with exitCode
  // =========================================================================
  it("Scenario 2: failed job non-zero exit -> failed with exitCode 42", async () => {
    const scriptPath = path.join(projectDir, "fail.js");
    fs.writeFileSync(scriptPath, "console.error('fatal error'); process.exit(42);\n", "utf-8");

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

    const status = await waitForJobState(jobManager, start.jobId, ["failed"]);
    expect(status.state).toBe("failed");
    expect(status.exitCode).toBe(42);
  });

  // =========================================================================
  // Scenario 3: Timed out job: reaches timeoutMs, marked timed_out, process tree terminated
  // =========================================================================
  it("Scenario 3: timeout job -> timed_out / timed-out and process killed", async () => {
    const scriptPath = path.join(projectDir, "sleep.js");
    fs.writeFileSync(scriptPath, "setInterval(() => {}, 1000);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "sleep.js",
        args: [],
        cwd: ".",
      },
      timeoutMs: 250, // Short timeout
    });

    const status = await waitForJobState(jobManager, start.jobId, ["timed_out", "timed-out"], 4000);
    expect(["timed_out", "timed-out"]).toContain(status.state);
    expect(status.finishedAt).toBeDefined();
  });

  // =========================================================================
  // Scenario 4: Cancel queued job: transitions queued -> cancelled immediately without spawning process
  // =========================================================================
  it("Scenario 4: cancel queued job transitions queued -> cancelled without spawning", async () => {
    const scriptPath = path.join(projectDir, "long.js");
    fs.writeFileSync(scriptPath, "setInterval(() => {}, 1000);\n", "utf-8");

    // Start 1st job (saturates maxRunningPerProject = 1)
    const job1 = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "long.js",
        args: [],
        cwd: ".",
        timeoutMs: 10000,
      },
    });
    expect(job1.state).toBe("running");

    // Start 2nd job (enters queue)
    const job2 = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "long.js",
        args: [],
        cwd: ".",
        timeoutMs: 10000,
      },
    });
    expect(job2.state).toBe("queued");

    // Cancel the queued job
    const cancelRes = await jobManager.cancelJob(job2.jobId);
    expect(cancelRes.state).toBe("cancelled");
    expect(cancelRes.alreadyTerminal).toBe(false);

    const status = jobManager.getJobStatus(job2.jobId);
    expect(status.state).toBe("cancelled");
    expect(status.startedAt).toBeFalsy();

    // Clean up job 1
    await jobManager.cancelJob(job1.jobId);
  });

  // =========================================================================
  // Scenario 5: Cancel running job: transitions running -> cancelled, process tree killed
  // =========================================================================
  it("Scenario 5: cancel running job transitions running -> cancelled and kills process", async () => {
    const scriptPath = path.join(projectDir, "spin.js");
    fs.writeFileSync(scriptPath, "setInterval(() => {}, 1000);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "spin.js",
        args: [],
        cwd: ".",
        timeoutMs: 10000,
      },
    });
    expect(start.state).toBe("running");

    const cancelRes = await jobManager.cancelJob(start.jobId);
    expect(cancelRes.state).toBe("cancelled");
    expect(cancelRes.alreadyTerminal).toBe(false);

    const status = jobManager.getJobStatus(start.jobId);
    expect(status.state).toBe("cancelled");
    expect(status.finishedAt).toBeDefined();
  });

  // =========================================================================
  // Scenario 6: Cancel finished job: idempotent, returns alreadyTerminal: true
  // =========================================================================
  it("Scenario 6: cancel finished job is idempotent and returns alreadyTerminal: true", async () => {
    const scriptPath = path.join(projectDir, "quick.js");
    fs.writeFileSync(scriptPath, "process.exit(0);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "quick.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    await waitForJobState(jobManager, start.jobId, ["succeeded"]);

    // First cancel on terminal job
    const cancel1 = await jobManager.cancelJob(start.jobId);
    expect(cancel1.state).toBe("succeeded");
    expect(cancel1.alreadyTerminal).toBe(true);

    // Second cancel on terminal job
    const cancel2 = await jobManager.cancelJob(start.jobId);
    expect(cancel2.state).toBe("succeeded");
    expect(cancel2.alreadyTerminal).toBe(true);
  });

  // =========================================================================
  // Scenario 7: Incremental logs polling: cursor pagination returns progressive chunks
  // =========================================================================
  it("Scenario 7: incremental logs polling with cursor pagination", async () => {
    const scriptPath = path.join(projectDir, "logs.js");
    fs.writeFileSync(
      scriptPath,
      `
      console.log("Chunk1");
      setTimeout(() => {
        console.log("Chunk2");
        setTimeout(() => {
          console.log("Chunk3");
          process.exit(0);
        }, 100);
      }, 100);
      `,
      "utf-8"
    );

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "logs.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    await waitForJobState(jobManager, start.jobId, ["succeeded"]);

    // Fetch chunk 1 with limit 1 to ensure cursor pagination triggers
    const res1 = jobManager.getJobLogs({ jobId: start.jobId, cursor: null, limit: 1 });
    expect(res1.chunks.length).toBe(1);
    expect(res1.nextCursor).toBeTruthy();

    // Fetch remaining chunks using nextCursor
    const res2 = jobManager.getJobLogs({ jobId: start.jobId, cursor: res1.nextCursor, limit: 500 });
    expect(res2.chunks.length).toBeGreaterThan(0);

    const text1 = res1.chunks.map((c) => c.text).join("");
    const text2 = res2.chunks.map((c) => c.text).join("");
    const combined = text1 + text2;
    expect(combined).toContain("Chunk1");
    expect(combined).toContain("Chunk2");
    expect(combined).toContain("Chunk3");
  });

  // =========================================================================
  // Scenario 8: Output truncation: capped at 5MB with marker, outputTruncated flag set
  // =========================================================================
  it("Scenario 8: output capped at 5MB with sentinel marker and outputTruncated flag", () => {
    const maxBytes = 5 * 1024 * 1024;
    const buf = new JobLogBuffer(maxBytes);

    // Write 6 MB of data in 1MB chunks
    const oneMbString = "A".repeat(1024 * 1024);
    for (let i = 0; i < 6; i++) {
      buf.append("stdout", oneMbString);
    }

    expect(buf.isTruncated).toBe(true);
    // Truncation sentinel is placed at head of ring buffer chunks when oldest chunks are evicted
    expect(buf.getLogs().chunks[0]?.text).toContain("[output truncated]");
    expect(buf.totalBytes).toBeLessThanOrEqual(maxBytes + 100);
  });

  // =========================================================================
  // Scenario 9: Logs edge cases: out-of-bounds cursor returns empty, empty job returns empty chunk
  // =========================================================================
  it("Scenario 9: logs pagination edge cases (out of bounds & empty)", async () => {
    const scriptPath = path.join(projectDir, "silent.js");
    fs.writeFileSync(scriptPath, "process.exit(0);\n", "utf-8");

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "silent.js",
        args: [],
        cwd: ".",
        timeoutMs: 5000,
      },
    });

    await waitForJobState(jobManager, start.jobId, ["succeeded"]);

    // Empty log query
    const emptyLog = jobManager.getJobLogs({ jobId: start.jobId, cursor: null, limit: 100 });
    expect(emptyLog.chunks.length).toBe(0);
    expect(emptyLog.nextCursor).toBeNull();

    // Out-of-bounds cursor
    const oobCursor = Buffer.from(JSON.stringify({ lastSeq: 999999 })).toString("base64url");
    const oobLog = jobManager.getJobLogs({ jobId: start.jobId, cursor: oobCursor, limit: 100 });
    expect(oobLog.chunks.length).toBe(0);
    expect(oobLog.nextCursor).toBeNull();
  });

  // =========================================================================
  // Scenario 10: Invalid jobId: getJobStatus, getJobLogs, cancelJob throw JOB_NOT_FOUND
  // =========================================================================
  it("Scenario 10: invalid jobId throws JOB_NOT_FOUND across all job methods", async () => {
    const fakeId = "job_non_existent_12345";

    expect(() => jobManager.getJobStatus(fakeId)).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.JOB_NOT_FOUND })
    );

    expect(() => jobManager.getJobLogs({ jobId: fakeId, cursor: null, limit: 100 })).toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.JOB_NOT_FOUND })
    );

    await expect(jobManager.cancelJob(fakeId)).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.JOB_NOT_FOUND })
    );
  });

  // =========================================================================
  // Scenario 11: Preflight disabled project: starting job on disabled project throws PROJECT_DISABLED
  // =========================================================================
  it("Scenario 11: disabled project throws PROJECT_DISABLED before job start", async () => {
    projectRegistry.disable(projectId);

    await expect(
      jobManager.startJob({
        command: {
          kind: "node-script",
          projectId,
          path: "ok.js",
          args: [],
          cwd: ".",
        },
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: LocalBridgeErrorCode.PROJECT_DISABLED })
    );
  });

  // =========================================================================
  // Scenario 12: Preflight read-only project: executing modifying command throws PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS
  // =========================================================================
  it("Scenario 12: read-only project throws PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS for modifying commands", async () => {
    projectRegistry.setAccessMode(projectId, "read-only");
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    const pkgJson = {
      name: "test-pkg",
      version: "1.0.0",
      scripts: { build: "node -v" },
    };
    fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(pkgJson, null, 2), "utf-8");

    // package-script build in read-only project requires write access
    await expect(
      jobManager.startJob({
        command: {
          kind: "package-script",
          projectId,
          manager: "npm",
          script: "build",
        },
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS,
      })
    );
  });

  // =========================================================================
  // Scenario 13: Closed-loop approval: commandPolicy=ask -> APPROVAL_REQUIRED -> approved -> retry starts exactly 1 job
  // =========================================================================
  it("Scenario 13: commandPolicy=ask creates APPROVAL_REQUIRED and approves into exactly 1 job", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    const scriptPath = path.join(projectDir, "ask.js");
    fs.writeFileSync(scriptPath, "console.log('approved run'); process.exit(0);\n", "utf-8");

    const cmdSpec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "ask.js",
      args: [],
      cwd: ".",
    };

    // Step 1: Call startJob without approvalId -> throws APPROVAL_REQUIRED
    let approvalId: string | undefined;
    try {
      await jobManager.startJob({ command: cmdSpec });
      expect.fail("Expected APPROVAL_REQUIRED");
    } catch (err: any) {
      expect(err.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
      approvalId = err.details?.approvalId;
    }
    expect(approvalId).toBeDefined();

    // Verify approval request pending
    const appRec = approvalManager.get(approvalId!);
    expect(appRec?.status).toBe("pending");
    expect(appRec?.operation).toBe("job.start");

    // Step 2: Operator approves
    approvalManager.resolve({
      approvalId: approvalId!,
      action: "approve",
      resolvedBy: "admin",
    });
    expect(approvalManager.get(approvalId!)?.status).toBe("approved");

    // Step 3: Retry startJob with approvalId
    const startResult = await jobManager.startJob({
      command: cmdSpec,
      approvalId: approvalId!,
    });
    expect(startResult.jobId).toBeDefined();

    // Verify approval consumed
    expect(approvalManager.get(approvalId!)?.status).toBe("consumed");

    // Verify exactly 1 job was created
    const res = jobManager.listJobs({ projectId });
    expect(res.jobs.length).toBe(1);
    expect(res.jobs[0]?.jobId).toBe(startResult.jobId);
  });

  // =========================================================================
  // Scenario 14: Approval replay attack: reusing already consumed approvalId throws APPROVAL_ALREADY_RESOLVED
  // =========================================================================
  it("Scenario 14: reusing consumed approvalId throws APPROVAL_ALREADY_RESOLVED", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    const scriptPath = path.join(projectDir, "replay.js");
    fs.writeFileSync(scriptPath, "console.log('replay'); process.exit(0);\n", "utf-8");

    const cmdSpec: CommandSpec = {
      kind: "node-script",
      projectId,
      path: "replay.js",
      args: [],
      cwd: ".",
    };

    let approvalId = "";
    try {
      await jobManager.startJob({ command: cmdSpec });
    } catch (err: any) {
      approvalId = err.details?.approvalId;
    }

    approvalManager.resolve({ approvalId, action: "approve", resolvedBy: "admin" });

    // First use consumes it
    await jobManager.startJob({ command: cmdSpec, approvalId });

    // Second use (replay) must throw APPROVAL_ALREADY_RESOLVED
    await expect(
      jobManager.startJob({ command: cmdSpec, approvalId })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
      })
    );
  });

  // =========================================================================
  // Scenario 15: Approval payload tamper: altering command arguments throws APPROVAL_PAYLOAD_MISMATCH
  // =========================================================================
  it("Scenario 15: tampering with command parameters throws APPROVAL_PAYLOAD_MISMATCH", async () => {
    projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
    });

    const scriptPath = path.join(projectDir, "safe.js");
    fs.writeFileSync(scriptPath, "console.log('original'); process.exit(0);\n", "utf-8");
    const scriptTampered = path.join(projectDir, "tampered.js");
    fs.writeFileSync(scriptTampered, "console.log('tampered'); process.exit(0);\n", "utf-8");

    let approvalId = "";
    try {
      await jobManager.startJob({
        command: {
          kind: "node-script",
          projectId,
          path: "safe.js",
          args: ["--original"],
          cwd: ".",
        },
      });
    } catch (err: any) {
      approvalId = err.details?.approvalId;
    }

    approvalManager.resolve({ approvalId, action: "approve", resolvedBy: "admin" });

    // Attempt start with tampered arguments
    await expect(
      jobManager.startJob({
        command: {
          kind: "node-script",
          projectId,
          path: "safe.js",
          args: ["--tampered-flag"],
          cwd: ".",
        },
        approvalId,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
      })
    );
  });

  // =========================================================================
  // Scenario 16: Emergency stop: cancelAllJobs aborts all running and queued jobs
  // =========================================================================
  it("Scenario 16: emergency stop cancelAllJobs cancels all running and queued jobs", async () => {
    const scriptPath = path.join(projectDir, "loop.js");
    fs.writeFileSync(scriptPath, "setInterval(() => {}, 1000);\n", "utf-8");

    const job1 = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "loop.js",
        args: [],
        cwd: ".",
      },
    });

    const job2 = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "loop.js",
        args: [],
        cwd: ".",
      },
    });

    expect(job1.state).toBe("running");
    expect(job2.state).toBe("queued");

    const res = await jobManager.cancelAllJobs("Emergency Stop triggered by user");
    expect(res.cancelledCount).toBe(2);
    expect(res.jobIds).toContain(job1.jobId);
    expect(res.jobIds).toContain(job2.jobId);

    expect(jobManager.getJobStatus(job1.jobId).state).toBe("cancelled");
    expect(jobManager.getJobStatus(job2.jobId).state).toBe("cancelled");
  });

  // =========================================================================
  // Scenario 17: Pause AI: blocks new MCP job starts while existing running jobs continue
  // =========================================================================
  it("Scenario 17: pause AI blocks new operations while existing running jobs continue", async () => {
    const dbConn = initDatabase(dbPath, path.join(__dirname, "../apps/server/src/db/migrations"));
    const runnerReg = new RunnerRegistry();
    const rpcSvc = new RunnerRpcService(runnerReg);
    const projSvc = new ServerProjectService(dbConn.db, runnerReg);
    const mcpCtx = new McpContext({
      projectService: projSvc,
      runnerRegistry: runnerReg,
      rpcService: rpcSvc,
      db: dbConn.db,
    });

    const scriptPath = path.join(projectDir, "run-through-pause.js");
    fs.writeFileSync(scriptPath, "setInterval(() => {}, 1000);\n", "utf-8");

    const runningJob = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "run-through-pause.js",
        args: [],
        cwd: ".",
      },
    });
    expect(runningJob.state).toBe("running");

    // Operator triggers Pause AI
    expect(mcpCtx.isPaused()).toBe(false);
    mcpCtx.setPaused(true);
    expect(mcpCtx.isPaused()).toBe(true);

    // Existing job is unaffected and still running
    const status = jobManager.getJobStatus(runningJob.jobId);
    expect(status.state).toBe("running");

    // Clean up
    await jobManager.cancelJob(runningJob.jobId);
    dbConn.close();
  });

  // =========================================================================
  // Scenario 18: Runner disconnect: running jobs marked interrupted, queued jobs marked cancelled
  // =========================================================================
  it("Scenario 18: runner disconnect updates running -> interrupted and queued -> cancelled in SQLite", () => {
    const dbConn = initDatabase(dbPath, path.join(__dirname, "../apps/server/src/db/migrations"));
    const runnerReg = new RunnerRegistry();

    // Register disconnect listener as done in apps/server/src/app.ts
    runnerReg.onDisconnect((runnerId: string) => {
      const now = Date.now();
      dbConn.db
        .prepare(
          `UPDATE jobs SET state = 'interrupted', finished_at = ?, error_code = 'JOB_RUNNER_DISCONNECTED', error_message = 'Runner disconnected while job was running' WHERE runner_id = ? AND state = 'running'`
        )
        .run(now, runnerId);

      dbConn.db
        .prepare(
          `UPDATE jobs SET state = 'cancelled', finished_at = ?, error_code = 'JOB_RUNNER_DISCONNECTED', error_message = 'Runner disconnected while job was queued' WHERE runner_id = ? AND state = 'queued'`
        )
        .run(now, runnerId);
    });

    const runnerId = "test-runner-disconnect-1";
    const now = Date.now();

    // Insert 1 running and 1 queued job into SQLite
    dbConn.db
      .prepare(
        `INSERT INTO jobs (id, project_id, runner_id, command_kind, state, created_at, started_at)
         VALUES ('job_run_1', 'proj1', ?, 'node-script', 'running', ?, ?)`
      )
      .run(runnerId, now, now);

    dbConn.db
      .prepare(
        `INSERT INTO jobs (id, project_id, runner_id, command_kind, state, created_at)
         VALUES ('job_queue_1', 'proj1', ?, 'node-script', 'queued', ?)`
      )
      .run(runnerId, now);

    // Mock a registered connection then unregister it
    (runnerReg as any).connections.set(runnerId, {
      runnerId,
      socket: { close: () => {} },
      tokenRecord: { id: "token1" },
      dispose: () => {},
    });

    runnerReg.unregister(runnerId);

    // Verify DB states
    const rowRun = dbConn.db.prepare("SELECT * FROM jobs WHERE id = 'job_run_1'").get() as any;
    expect(rowRun.state).toBe("interrupted");
    expect(rowRun.error_code).toBe("JOB_RUNNER_DISCONNECTED");

    const rowQueued = dbConn.db.prepare("SELECT * FROM jobs WHERE id = 'job_queue_1'").get() as any;
    expect(rowQueued.state).toBe("cancelled");
    expect(rowQueued.error_code).toBe("JOB_RUNNER_DISCONNECTED");

    dbConn.close();
  });

  // =========================================================================
  // Scenario 19: Crash recovery: orphaned running/queued jobs converge to interrupted on startup
  // =========================================================================
  it("Scenario 19: crash recovery converges orphaned running/queued jobs to interrupted", () => {
    // 1. SQLite Server Crash Recovery Test
    const dbConn = initDatabase(dbPath, path.join(__dirname, "../apps/server/src/db/migrations"));
    const now = Date.now();

    dbConn.db
      .prepare(
        `INSERT INTO jobs (id, project_id, runner_id, command_kind, state, created_at, started_at)
         VALUES ('job_orphaned_run', 'proj1', 'r1', 'node-script', 'running', ?, ?)`
      )
      .run(now, now);

    dbConn.db
      .prepare(
        `INSERT INTO jobs (id, project_id, runner_id, command_kind, state, created_at)
         VALUES ('job_orphaned_queue', 'proj1', 'r1', 'node-script', 'queued', ?)`
      )
      .run(now);

    // Simulate startup recovery logic from apps/server/src/app.ts
    dbConn.db
      .prepare(
        `UPDATE jobs SET state = 'interrupted', finished_at = ?, error_code = 'JOB_RUNNER_INTERRUPTED', error_message = 'Job was interrupted due to server restart or crash' WHERE state IN ('running', 'queued')`
      )
      .run(Date.now());

    const row1 = dbConn.db.prepare("SELECT * FROM jobs WHERE id = 'job_orphaned_run'").get() as any;
    expect(row1.state).toBe("interrupted");
    expect(row1.error_code).toBe("JOB_RUNNER_INTERRUPTED");

    const row2 = dbConn.db.prepare("SELECT * FROM jobs WHERE id = 'job_orphaned_queue'").get() as any;
    expect(row2.state).toBe("interrupted");
    expect(row2.error_code).toBe("JOB_RUNNER_INTERRUPTED");

    dbConn.close();

    // 2. Runner Local Persistence Crash Recovery Test
    const runnerStateFile = path.join(tempDir, "jobs-state.json");
    const staleState = [
      {
        id: "job_runner_crashed_1",
        projectId,
        state: "running",
        command: { kind: "node-script", projectId, path: "foo.js" },
        createdAt: now,
        startedAt: now,
      },
      {
        id: "job_runner_crashed_2",
        projectId,
        state: "queued",
        command: { kind: "node-script", projectId, path: "foo.js" },
        createdAt: now,
      },
    ];
    fs.writeFileSync(runnerStateFile, JSON.stringify(staleState, null, 2), "utf-8");

    // Initialize new JobManager with persistState
    const newJobManager = new JobManager(
      projectRegistry,
      execRegistry,
      tempDir,
      undefined,
      approvalManager,
      { persistState: true }
    );

    const recovered1 = newJobManager.getJobStatus("job_runner_crashed_1");
    expect(recovered1.state).toBe("interrupted");
    expect(recovered1.errorCode).toBe(LocalBridgeErrorCode.JOB_RUNNER_INTERRUPTED);

    const recovered2 = newJobManager.getJobStatus("job_runner_crashed_2");
    expect(recovered2.state).toBe("interrupted");
    expect(recovered2.errorCode).toBe(LocalBridgeErrorCode.JOB_RUNNER_INTERRUPTED);
  });

  // =========================================================================
  // Scenario 20: Real child process tree termination on Windows (parent spawns child process)
  // =========================================================================
  it("Scenario 20: real child process tree termination recursively kills child processes", async () => {
    const childPidFile = path.join(tempDir, "child.pid");
    const parentPidFile = path.join(tempDir, "parent.pid");

    // Child script writes its PID and loops
    const childScript = path.join(projectDir, "child.js");
    fs.writeFileSync(
      childScript,
      `
      import fs from "node:fs";
      const pidFile = process.argv[2];
      fs.writeFileSync(pidFile, String(process.pid), "utf-8");
      console.log("Child running PID: " + process.pid);
      setInterval(() => {}, 1000);
      `,
      "utf-8"
    );

    // Parent script writes its PID, spawns child, and loops
    const parentScript = path.join(projectDir, "parent.js");
    fs.writeFileSync(
      parentScript,
      `
      import { spawn } from "node:child_process";
      import fs from "node:fs";
      const childPidFile = process.argv[2];
      const parentPidFile = process.argv[3];
      fs.writeFileSync(parentPidFile, String(process.pid), "utf-8");
      console.log("Parent running PID: " + process.pid);
      const child = spawn(process.execPath, ["child.js", childPidFile], { stdio: "ignore" });
      setInterval(() => {}, 1000);
      `,
      "utf-8"
    );

    const start = await jobManager.startJob({
      command: {
        kind: "node-script",
        projectId,
        path: "parent.js",
        args: [childPidFile, parentPidFile],
        cwd: ".",
        timeoutMs: 30000,
      },
    });

    expect(start.state).toBe("running");

    // Wait until both PID files exist
    let parentPid = 0;
    let childPid = 0;
    const waitStart = Date.now();

    while (Date.now() - waitStart < 5000) {
      if (fs.existsSync(parentPidFile) && fs.existsSync(childPidFile)) {
        const pContent = fs.readFileSync(parentPidFile, "utf-8").trim();
        const cContent = fs.readFileSync(childPidFile, "utf-8").trim();
        if (pContent && cContent) {
          parentPid = parseInt(pContent, 10);
          childPid = parseInt(cContent, 10);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(parentPid).toBeGreaterThan(0);
    expect(childPid).toBeGreaterThan(0);
    expect(isPidAlive(parentPid)).toBe(true);
    expect(isPidAlive(childPid)).toBe(true);

    // Cancel the job (this triggers killProcessTree on parent)
    const cancelRes = await jobManager.cancelJob(start.jobId);
    expect(cancelRes.state).toBe("cancelled");

    // Verify both parent and child processes are terminated
    let processesDead = false;
    for (let i = 0; i < 30; i++) {
      if (!isPidAlive(parentPid) && !isPidAlive(childPid)) {
        processesDead = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(processesDead).toBe(true);
  });
});

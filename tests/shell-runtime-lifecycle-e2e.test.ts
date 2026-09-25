import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ExecutableRegistry } from "../apps/runner/src/process/index.js";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";
import { PersistentRuntimeManager } from "../apps/runner/src/runtime/index.js";

describe("Persistent Runtime with Shell Command Lifecycle", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let execRegistry: ExecutableRegistry;
  let approvalManager: ApprovalManager;
  let runtimeManager: PersistentRuntimeManager;
  let projectId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-shell-runtime-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "Shell Runtime Project",
      accessMode: "read-write",
    });
    projectId = rec.id;
    projectRegistry.setExecutionMode(projectId, "project-code");

    execRegistry = new ExecutableRegistry();
    approvalManager = new ApprovalManager();
    runtimeManager = new PersistentRuntimeManager(
      projectRegistry,
      execRegistry,
      approvalManager,
      undefined,
      { runnerStateDir: tempDir, persistState: false }
    );
  });

  afterEach(async () => {
    try {
      await runtimeManager.dispose();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("starts, streams logs, queries status, restarts, and stops a shell-command runtime", async () => {
    // 1. Create a server script that logs periodically and stays alive
    const serverScript = `
      console.log("SERVER_STARTED_READY");
      let count = 0;
      setInterval(() => {
        count++;
        console.log("HEARTBEAT_" + count);
      }, 100);
    `;
    fs.writeFileSync(path.join(projectDir, "server.js"), serverScript);

    // 2. Start runtime via shell-command
    const startResult = await runtimeManager.start({
      projectId,
      name: "node-server-runtime",
      launch: {
        kind: "shell-command",
        command: "node",
        args: ["server.js"],
      },
    });

    expect(startResult.runtimeId).toBeDefined();
    expect(startResult.state).toBe("running");
    expect(startResult.generation).toBe(1);

    const runtimeId = startResult.runtimeId;

    // 3. Wait 350ms to allow output to accumulate
    await new Promise((resolve) => setTimeout(resolve, 350));

    // 4. Query status
    const status = runtimeManager.status({ projectId, runtimeId });
    expect(status.state).toBe("running");
    expect(status.pid).toBeDefined();
    expect(status.restartCount).toBe(0);

    // 5. Read logs
    const logsResult = runtimeManager.logs({ runtimeId, limit: 50 });
    const logText = logsResult.entries.map((l) => l.text).join("\n");
    expect(logText).toContain("SERVER_STARTED_READY");
    expect(logText).toContain("HEARTBEAT_");

    // 6. Test duplicate prevention (starting with identical launch spec throws RUNTIME_ALREADY_RUNNING)
    await expect(
      runtimeManager.start({
        projectId,
        name: "node-server-runtime",
        launch: {
          kind: "shell-command",
          command: "node",
          args: ["server.js"],
        },
      })
    ).rejects.toThrowError(LocalBridgeError);

    try {
      await runtimeManager.start({
        projectId,
        name: "node-server-runtime",
        launch: {
          kind: "shell-command",
          command: "node",
          args: ["server.js"],
        },
      });
    } catch (err: any) {
      expect(err.code).toBe(LocalBridgeErrorCode.RUNTIME_ALREADY_RUNNING);
      expect(err.details?.runtimeId).toBe(runtimeId);
    }

    // 7. Restart runtime
    const restartResult = await runtimeManager.restart({ runtimeId });
    expect(restartResult.state).toBe("running");
    expect(restartResult.generation).toBe(2);

    // Wait for restart output
    await new Promise((resolve) => setTimeout(resolve, 250));

    const postRestartStatus = runtimeManager.status({ projectId, runtimeId });
    expect(postRestartStatus.generation).toBe(2);
    expect(postRestartStatus.restartCount).toBe(1);

    // 8. Stop runtime
    const stopResult = await runtimeManager.stop({ runtimeId });
    expect(stopResult.state).toBe("stopped");

    const finalStatus = runtimeManager.status({ projectId, runtimeId });
    expect(finalStatus.state).toBe("stopped");
    expect(finalStatus.pid).toBeUndefined();
  });
});

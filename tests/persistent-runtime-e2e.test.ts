import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
const fixtureSourceDir = path.resolve(__dirname, "fixtures/persistent-runtime-project");

describe("P3-D Persistent Development Runtime Comprehensive E2E", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let readOnlyMcpToken: string;
  let runnerToken: string;
  let managementSecret: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  let readOnlyClient: Client;
  let readOnlyTransport: StreamableHTTPClientTransport;

  function parseToolResult<T = any>(res: any): T {
    if (res.isError) {
      const msg = res.content?.[0]?.text ?? JSON.stringify(res);
      throw new Error(`Tool call failed: ${msg}`);
    }
    expect(res.isError).toBeFalsy();
    expect(res.content).toBeDefined();
    expect(res.content.length).toBeGreaterThan(0);
    return JSON.parse(res.content[0].text);
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-runtime-e2e-"));
    dbFilePath = path.join(tmpDir, "runtime-e2e.db");
    projectDir = path.join(tmpDir, "runtime-project");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    // Copy fixture into project dir
    fs.cpSync(fixtureSourceDir, projectDir, { recursive: true });

    // Initialize git repo in projectDir
    execSync("git init -b main", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email test@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name TestOperator", { cwd: projectDir, stdio: "ignore" });
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    // 1. Build & Start Server
    managementSecret = "lm_super_secret_management_token_runtime";
    const serverConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config: serverConfig,
      migrationsDir,
      enableLogging: false,
      managementSecret,
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

    // Create full scope MCP token
    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Runtime-E2E-Full-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mcpTokenRecord.token;

    // Create read-only scope MCP token
    const readOnlyTokenRecord = serverInstance.tokenService.createToken({
      name: "Runtime-E2E-ReadOnly-Token",
      type: "mcp",
      scopes: ["read"],
    });
    readOnlyMcpToken = readOnlyTokenRecord.token;

    // Create runner token
    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Runtime-E2E-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    // 2. Start Runner Daemon
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Runtime-E2E-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: {
        enabled: true,
        initialDelayMs: 100,
        maxDelayMs: 500,
        factor: 1.5,
        jitter: false,
      },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "persistent-runtime-project",
      accessMode: "read-write",
    });
    projectId = authorized.id;
    runner.projectRegistry.setExecutionMode(projectId, "project-code");
    runner.projectRegistry.setTrustPolicy(projectId, {
      trustLevel: "full-project-trust",
      commandPolicy: "allow",
      filePolicy: "allow",
    });

    await runner.start();

    // Wait for runner registration on server
    let ready = false;
    for (let i = 0; i < 50; i++) {
      const p = serverInstance.projectService.getProject(projectId);
      if (p && p.runnerId) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);

    // 3. Connect MCP Clients
    transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${serverPort}/mcp`),
      {
        protocolVersion: "2026-07-28",
        requestInit: {
          headers: {
            Authorization: `Bearer ${mcpToken}`,
            connection: "close",
          },
        },
      }
    );

    client = new Client(
      { name: "runtime-test-client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );
    await client.connect(transport);

    readOnlyTransport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${serverPort}/mcp`),
      {
        protocolVersion: "2026-07-28",
        requestInit: {
          headers: {
            Authorization: `Bearer ${readOnlyMcpToken}`,
            connection: "close",
          },
        },
      }
    );

    readOnlyClient = new Client(
      { name: "runtime-readonly-client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );
    await readOnlyClient.connect(readOnlyTransport);
  }, 45000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    try {
      await readOnlyClient?.close();
    } catch {}
    try {
      await runner?.stop();
    } catch {}
    try {
      await serverInstance?.app?.close();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // ============================================================
  // 1. Full Lifecycle: Start -> Status -> Logs -> Stop
  // ============================================================
  describe("1. Full Lifecycle (Start, Status, Logs, Stop)", () => {
    let runtimeId: string;

    it("starts a persistent runtime dev server successfully", async () => {
      const res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
          },
          name: "dev-server-1",
        },
      });

      const data = parseToolResult(res);
      expect(data.runtimeId).toBeDefined();
      expect(data.name).toBe("dev-server-1");
      expect(["starting", "running"]).toContain(data.state);
      expect(data.generation).toBe(1);

      runtimeId = data.runtimeId;
    });

    it("verifies runtime is listed in localbridge_runtime_list", async () => {
      const res = await client.callTool({
        name: "localbridge_runtime_list",
        arguments: { projectId },
      });

      const data = parseToolResult(res);
      expect(data.runtimes).toBeDefined();
      const found = data.runtimes.find((r: any) => r.runtimeId === runtimeId);
      expect(found).toBeDefined();
      expect(found.name).toBe("dev-server-1");
    });

    it("queries localbridge_runtime_status and captures status & pid", async () => {
      // Wait briefly for process to transition to running
      let state = "";
      for (let i = 0; i < 20; i++) {
        const res = await client.callTool({
          name: "localbridge_runtime_status",
          arguments: { runtimeId },
        });
        const data = parseToolResult(res);
        state = data.state;
        if (state === "running") {
          expect(data.pid).toBeDefined();
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(state).toBe("running");
    });

    it("reads incremental logs via localbridge_runtime_logs", async () => {
      // Allow some ticks to log
      await new Promise((r) => setTimeout(r, 500));

      const res = await client.callTool({
        name: "localbridge_runtime_logs",
        arguments: { runtimeId, limit: 100 },
      });

      const data = parseToolResult(res);
      expect(data.entries).toBeDefined();
      expect(data.entries.length).toBeGreaterThan(0);

      const allText = data.entries.map((e: any) => e.text).join("");
      expect(allText).toContain("Server starting up");

      // Test afterSequence cursor
      const firstSeq = data.entries[0].seq;
      const filteredRes = await client.callTool({
        name: "localbridge_runtime_logs",
        arguments: { runtimeId, afterSequence: firstSeq },
      });
      const filteredData = parseToolResult(filteredRes);
      expect(filteredData.entries.every((e: any) => e.seq > firstSeq)).toBe(true);
    });

    it("stops the persistent runtime cleanly via localbridge_runtime_stop", async () => {
      const res = await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId },
      });

      const data = parseToolResult(res);
      expect(data.state).toBe("stopped");

      // Verify status reflects stopped
      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });
      const statusData = parseToolResult(statusRes);
      expect(statusData.state).toBe("stopped");
      expect(statusData.stoppedAt).toBeDefined();
    });
  });

  // ============================================================
  // 2. Restart & Generation Tracking
  // ============================================================
  describe("2. Restart & Generation Tracking", () => {
    let runtimeId: string;

    it("restarts a stopped runtime, advancing generation to 2", async () => {
      // Start initial
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
          },
          name: "restartable-server",
        },
      });
      const startData = parseToolResult(startRes);
      runtimeId = startData.runtimeId;
      expect(startData.generation).toBe(1);

      try {
        // Stop it
        await client.callTool({
          name: "localbridge_runtime_stop",
          arguments: { runtimeId },
        });

        // Restart it
        const restartRes = await client.callTool({
          name: "localbridge_runtime_restart",
          arguments: { runtimeId },
        });

        const restartData = parseToolResult(restartRes);
        expect(restartData.generation).toBe(2);
        expect(["starting", "running"]).toContain(restartData.state);

        // Verify status shows restartCount = 1
        const statusRes = await client.callTool({
          name: "localbridge_runtime_status",
          arguments: { runtimeId },
        });
        const statusData = parseToolResult(statusRes);
        expect(statusData.restartCount).toBe(1);

        // Verify logs can be filtered by generation 2
        await new Promise((r) => setTimeout(r, 400));
        const logsRes = await client.callTool({
          name: "localbridge_runtime_logs",
          arguments: { runtimeId, generation: 2 },
        });
        const logsData = parseToolResult(logsRes);
        expect(logsData.generation).toBe(2);
        expect(logsData.entries.length).toBeGreaterThan(0);
      } finally {
        // Clean up
        await client.callTool({
          name: "localbridge_runtime_stop",
          arguments: { runtimeId },
        });
      }
    });
  });

  // ============================================================
  // 3. Process Tree Kill Verification
  // ============================================================
  describe("3. Process Tree Kill Verification", () => {
    it("terminates child processes cleanly when stopping", async () => {
      const res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "registered-command",
            tool: "node",
            args: ["tree.js"],
          },
          name: "tree-server",
        },
      });

      const data = parseToolResult(res);
      const runtimeId = data.runtimeId;

      // Wait for processes to spin up
      await new Promise((r) => setTimeout(r, 800));

      // Check status to get PID
      const statusRes = await client.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      });
      const statusData = parseToolResult(statusRes);
      const pid = statusData.pid;
      expect(pid).toBeDefined();

      // Stop runtime
      const stopRes = await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId },
      });
      const stopData = parseToolResult(stopRes);
      expect(stopData.state).toBe("stopped");

      // Ensure process is dead
      await new Promise((r) => setTimeout(r, 500));
      let isAlive = true;
      try {
        process.kill(pid, 0);
      } catch {
        isAlive = false;
      }
      expect(isAlive).toBe(false);
    });
  });

  // ============================================================
  // 4. Duplicate Detection & Concurrency Limits
  // ============================================================
  describe("4. Duplicate Detection & Concurrency Limits", () => {
    it("rejects duplicate runtime start with RUNTIME_ALREADY_RUNNING", async () => {
      const startRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
          },
          name: "singleton-dev",
        },
      });
      const data = parseToolResult(startRes);
      const runtimeId = data.runtimeId;

      // Try to start exact same script again
      const dupRes = (await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "package-script",
            manager: "npm",
            script: "dev",
          },
          name: "singleton-dev",
        },
      })) as any;

      expect(dupRes.isError).toBe(true);
      expect(dupRes.content[0].text).toContain("already running");

      // Stop initial
      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId },
      });
    });

    it("enforces per-session concurrency limit (max 3 runtimes)", async () => {
      // Start a workflow session
      const sessionRes = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          title: "Session for concurrency limit test",
          goals: ["Test concurrency limits"],
        },
      });
      const sessionData = parseToolResult(sessionRes);
      const sessionId = sessionData.session.id;

      const activeIds: string[] = [];
      try {
        // Start 3 runtimes under this session with distinct args to avoid duplicate spec matching
        for (let i = 1; i <= 3; i++) {
          const res = await client.callTool({
            name: "localbridge_runtime_start",
            arguments: {
              projectId,
              sessionId,
              launch: {
                kind: "registered-command",
                tool: "node",
                args: ["server.js", `--session-slot=${i}`],
              },
              name: `session-rt-${i}`,
            },
          });
          const d = parseToolResult(res);
          activeIds.push(d.runtimeId);
        }

        // 4th runtime should exceed session limit
        const excessRes = (await client.callTool({
          name: "localbridge_runtime_start",
          arguments: {
            projectId,
            sessionId,
            launch: {
              kind: "registered-command",
              tool: "node",
              args: ["server.js", "--session-slot=4"],
            },
            name: "session-rt-4",
          },
        })) as any;

        expect(excessRes.isError).toBe(true);
        expect(excessRes.content[0].text.toLowerCase()).toContain("maximum active runtimes");
      } finally {
        for (const id of activeIds) {
          await client.callTool({
            name: "localbridge_runtime_stop",
            arguments: { runtimeId: id },
          });
        }
        await client.callTool({
          name: "localbridge_session_finish",
          arguments: { sessionId },
        });
      }
    });
  });

  // ============================================================
  // 5. Worktree & Session Guards
  // ============================================================
  describe("5. Worktree & Session Guards", () => {
    let sessionId: string;
    let worktreeId: string;
    let runtimeId: string;

    it("blocks worktree removal and session finish while runtime is running", async () => {
      // 1. Start session
      const sessRes = await client.callTool({
        name: "localbridge_session_start",
        arguments: {
          projectId,
          title: "Guard verification session",
          goals: ["Guard verification"],
        },
      });
      sessionId = parseToolResult(sessRes).session.id;

      // 2. Create worktree
      const wtRes = await client.callTool({
        name: "localbridge_worktree_create",
        arguments: {
          projectId,
          sessionId,
          branchName: "nexus/guard-test",
        },
      });
      worktreeId = parseToolResult(wtRes).worktree.id;

      // 3. Start runtime inside this worktree & session
      const rtRes = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          sessionId,
          launch: {
            kind: "registered-command",
            tool: "node",
            args: ["server.js", "--guarded"],
          },
          name: "guarded-runtime",
        },
      });
      runtimeId = parseToolResult(rtRes).runtimeId;

      // 4. Attempt to remove worktree -> must be rejected with WORKTREE_HAS_ACTIVE_RUNTIMES
      const removeWtRes = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: { worktreeId },
      })) as any;
      expect(removeWtRes.isError).toBe(true);
      expect(removeWtRes.content[0].text).toContain("active runtime");

      // 5. Attempt to finish session -> must be rejected with SESSION_HAS_ACTIVE_RUNTIMES
      const finishSessRes = (await client.callTool({
        name: "localbridge_session_finish",
        arguments: { sessionId },
      })) as any;
      expect(finishSessRes.isError).toBe(true);
      expect(finishSessRes.content[0].text).toContain("active runtime");

      // 6. Stop the runtime
      await client.callTool({
        name: "localbridge_runtime_stop",
        arguments: { runtimeId },
      });

      // 7. Now worktree removal and session finish should succeed
      const okRemoveWt = (await client.callTool({
        name: "localbridge_worktree_remove",
        arguments: { worktreeId },
      })) as any;
      expect(okRemoveWt.isError).toBeFalsy();

      const okFinishSess = (await client.callTool({
        name: "localbridge_session_finish",
        arguments: { sessionId },
      })) as any;
      expect(okFinishSess.isError).toBeFalsy();
    });
  });

  // ============================================================
  // 6. Token Scope Enforcement (read vs execute)
  // ============================================================
  describe("6. Token Scope Enforcement", () => {
    let runtimeId: string;

    beforeAll(async () => {
      // Start a runtime with full client
      const res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "registered-command",
            tool: "node",
            args: ["server.js", "--scope-test"],
          },
          name: "scope-test-rt",
        },
      });
      runtimeId = parseToolResult(res).runtimeId;
    });

    afterAll(async () => {
      if (runtimeId) {
        await client.callTool({
          name: "localbridge_runtime_stop",
          arguments: { runtimeId },
        });
      }
    });

    it("allows read-only token to call runtime_list, status, logs", async () => {
      const listRes = (await readOnlyClient.callTool({
        name: "localbridge_runtime_list",
        arguments: { projectId },
      })) as any;
      expect(listRes.isError).toBeFalsy();

      const statusRes = (await readOnlyClient.callTool({
        name: "localbridge_runtime_status",
        arguments: { runtimeId },
      })) as any;
      expect(statusRes.isError).toBeFalsy();

      const logsRes = (await readOnlyClient.callTool({
        name: "localbridge_runtime_logs",
        arguments: { runtimeId },
      })) as any;
      expect(logsRes.isError).toBeFalsy();
    });

    it("rejects read-only token on runtime_start, restart, stop with MCP_SCOPE_DENIED", async () => {
      await expect(
        readOnlyClient.callTool({
          name: "localbridge_runtime_start",
          arguments: {
            projectId,
            launch: {
              kind: "registered-command",
              tool: "node",
              args: ["server.js"],
            },
          },
        })
      ).rejects.toThrow(/MCP_SCOPE_DENIED/);

      await expect(
        readOnlyClient.callTool({
          name: "localbridge_runtime_restart",
          arguments: { runtimeId },
        })
      ).rejects.toThrow(/MCP_SCOPE_DENIED/);

      await expect(
        readOnlyClient.callTool({
          name: "localbridge_runtime_stop",
          arguments: { runtimeId },
        })
      ).rejects.toThrow(/MCP_SCOPE_DENIED/);
    });
  });

  // ============================================================
  // 7. Crash Recovery & Interrupted State
  // ============================================================
  describe("7. Crash Recovery & Interrupted State", () => {
    it("marks active runtimes as interrupted when runner disconnects/stops", async () => {
      // Start a runtime
      const res = await client.callTool({
        name: "localbridge_runtime_start",
        arguments: {
          projectId,
          launch: {
            kind: "registered-command",
            tool: "node",
            args: ["server.js"],
          },
          name: "crash-test-rt",
        },
      });
      const runtimeId = parseToolResult(res).runtimeId;

      // Stop runner directly to simulate unexpected shutdown
      await runner.stop();

      // Wait a moment for server to handle disconnect & transition runtimes to interrupted
      await new Promise((r) => setTimeout(r, 600));

      // Query database directly on server
      const dbRow = serverInstance.db.db
        .prepare("SELECT * FROM persistent_runtimes WHERE id = ?")
        .get(runtimeId) as any;

      expect(dbRow).toBeDefined();
      expect(dbRow.state).toBe("interrupted");
    });
  });
});

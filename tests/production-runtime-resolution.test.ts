import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const bundledRuntimeExe = path.resolve(rootDir, "apps/desktop/src-tauri/resources/runtime/node.exe");
const bundledServerEntry = path.resolve(rootDir, "apps/desktop/src-tauri/resources/server/index.js");
const bundledRunnerEntry = path.resolve(rootDir, "apps/desktop/src-tauri/resources/runner/index.js");

// Clean environment PATH that excludes any Node, npm, pnpm, cargo, or nvm directories
const cleanWindowsPath = "C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem";

describe("Production Runtime Resolution & Negative PATH Verification", () => {
  let tmpDir: string;
  let projectDir: string;
  let serverProcess: child_process.ChildProcess | null = null;
  let runnerProcess: child_process.ChildProcess | null = null;
  const testPort = 18092;
  const runnerToken = "lbr_test_self_contained_runner_token_456789";

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prod-runtime-test-"));
    // Ensure bundled resources exist
    expect(fs.existsSync(bundledRuntimeExe)).toBe(true);
    expect(fs.existsSync(bundledServerEntry)).toBe(true);
    expect(fs.existsSync(bundledRunnerEntry)).toBe(true);
  });

  afterAll(async () => {
    if (runnerProcess) {
      runnerProcess.kill();
      runnerProcess = null;
    }
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("1. Verifies that system node is completely unavailable in the clean test environment", () => {
    let commandFailed = false;
    try {
      child_process.execSync("node --version", {
        env: {
          PATH: cleanWindowsPath,
          SystemRoot: "C:\\Windows",
        },
        stdio: "pipe",
      });
    } catch {
      commandFailed = true;
    }
    expect(commandFailed).toBe(true);
  });

  it("2. Verifies that bundled node.exe executes and loads native better-sqlite3 with zero system PATH", () => {
    const serverDir = path.dirname(bundledServerEntry);
    const result = child_process.execFileSync(
      bundledRuntimeExe,
      [
        "-e",
        "const Database = require('./node_modules/better-sqlite3'); const db = new Database(':memory:'); const row = db.prepare('SELECT 777 as value').get(); console.log(JSON.stringify(row));",
      ],
      {
        cwd: serverDir,
        env: {
          PATH: cleanWindowsPath,
          SystemRoot: "C:\\Windows",
        },
        stdio: "pipe",
      }
    ).toString().trim();

    expect(JSON.parse(result)).toEqual({ value: 777 });
  });

  it("3. Spawns bundled Server without system Node on PATH", async () => {
    const dbPath = path.join(tmpDir, "server.db");
    const serverDir = path.dirname(bundledServerEntry);

    serverProcess = child_process.spawn(bundledRuntimeExe, [bundledServerEntry], {
      cwd: serverDir,
      env: {
        PATH: cleanWindowsPath,
        SystemRoot: "C:\\Windows",
        LOCALBRIDGE_SERVER_HOST: "127.0.0.1",
        LOCALBRIDGE_SERVER_PORT: String(testPort),
        LOCALBRIDGE_SERVER_DB_PATH: dbPath,
        LOCALBRIDGE_BOOTSTRAP_RUNNER_TOKEN: runnerToken,
        LOCALBRIDGE_LOG_LEVEL: "silent",
      },
      stdio: "pipe",
    });

    serverProcess.stderr?.on("data", (d) => console.error("SERVER_STDERR:", d.toString()));

    // Poll until server responds on minimal /health
    let ready = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch(`http://127.0.0.1:${testPort}/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // Retry
      }
    }
    expect(ready).toBe(true);
  }, 30000);

  it("4. Spawns bundled Runner without system Node on PATH and connects via WebSocket RPC", async () => {
    const projectsPath = path.join(tmpDir, "projects.json");
    const runnerDir = path.dirname(bundledRunnerEntry);

    // Initialize sample project
    projectDir = path.join(tmpDir, "sample-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "clean-env-app", scripts: { test: "node index.js" } }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(projectDir, "index.js"),
      "console.log('SELF_CONTAINED_TEST_SUCCESS'); process.exit(0);\n",
      "utf-8"
    );

    // Register project in projects.json
    fs.writeFileSync(
      projectsPath,
      JSON.stringify({
        projects: [
          {
            id: "proj_clean_env",
            name: "Clean Env Project",
            path: projectDir,
            canonicalRoot: fs.realpathSync.native(projectDir),
            accessMode: "read-write",
            executionMode: "project-code",
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }),
      "utf-8"
    );

    runnerProcess = child_process.spawn(bundledRuntimeExe, [bundledRunnerEntry], {
      cwd: runnerDir,
      env: {
        PATH: cleanWindowsPath,
        SystemRoot: "C:\\Windows",
        LOCALBRIDGE_SERVER_URL: `ws://127.0.0.1:${testPort}/runner/ws`,
        LOCALBRIDGE_RUNNER_TOKEN: runnerToken,
        LOCALBRIDGE_PROJECTS_PATH: projectsPath,
        LOCALBRIDGE_LOG_LEVEL: "silent",
      },
      stdio: "pipe",
    });

    runnerProcess.stderr?.on("data", (d) => console.error("RUNNER_STDERR:", d.toString()));

    // Poll until server detects runner connected
    let connected = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const res = await fetch(`http://127.0.0.1:${testPort}/api/status`);
        if (res.ok) {
          const body = (await res.json()) as { runners_connected: number };
          if (body.runners_connected >= 1) {
            connected = true;
            break;
          }
        }
      } catch {
        // Retry
      }
    }
    expect(connected).toBe(true);
  }, 30000);

  it("5. Executes end-to-end MCP workflow in zero-Node environment", async () => {
    // 1. Create MCP token
    const tokenRes = await fetch(`http://127.0.0.1:${testPort}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Clean Env Client", type: "mcp", scopes: ["read", "write", "execute"] }),
    });
    expect(tokenRes.ok).toBe(true);
    const { token: mcpToken } = (await tokenRes.json()) as { token: string };

    const mcpHeaders = {
      authorization: `Bearer ${mcpToken}`,
      "content-type": "application/json",
      "mcp-protocol-version": "2026-07-28",
      accept: "application/json, text/event-stream",
      connection: "close",
    };

    // Wait for project to be synchronized to Server
    let projectSynced = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const pRes = await fetch(`http://127.0.0.1:${testPort}/api/projects`);
      if (pRes.ok) {
        const pData = (await pRes.json()) as { projects: any[] };
        if (pData.projects && pData.projects.length > 0) {
          projectSynced = true;
          break;
        }
      }
    }
    expect(projectSynced).toBe(true);

    // 2. Read file via MCP
    const readRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req_read",
        method: "tools/call",
        params: {
          name: "localbridge_file_read",
          arguments: {
            projectId: "proj_clean_env",
            path: "index.js",
          },
        },
      }),
    });
    if (!readRes.ok) {
      console.error("READ_FAILED:", readRes.status, await readRes.text());
    }
    expect(readRes.ok).toBe(true);
    const readData = (await readRes.json()) as any;
    expect(readData.result.content[0].text).toContain("SELF_CONTAINED_TEST_SUCCESS");

    // 3. Start test job via MCP (Runner uses bundled node.exe as fallback since PATH has no node)
    const testJobRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req_job",
        method: "tools/call",
        params: {
          name: "localbridge_test_start",
          arguments: {
            projectId: "proj_clean_env",
          },
        },
      }),
    });
    expect(testJobRes.ok).toBe(true);
    const testJobData = (await testJobRes.json()) as any;
    const parsedJob = JSON.parse(testJobData.result.content[0].text);
    const jobId = parsedJob.jobId;
    expect(jobId).toMatch(/^job_/);

    // 4. Poll job status until succeeded
    let finished = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const statusRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `req_status_${i}`,
          method: "tools/call",
          params: {
            name: "localbridge_job_status",
            arguments: {
              jobId,
            },
          },
        }),
      });
      if (statusRes.ok) {
        const body = (await statusRes.json()) as any;
        const job = JSON.parse(body.result.content[0].text);
        if (job.state === "succeeded") {
          finished = true;
          break;
        }
      }
    }
    expect(finished).toBe(true);

    // 5. Fetch job logs via MCP
    const logsRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req_logs",
        method: "tools/call",
        params: {
          name: "localbridge_job_logs",
          arguments: {
            jobId,
          },
        },
      }),
    });
    expect(logsRes.ok).toBe(true);
    const logsData = (await logsRes.json()) as any;
    const parsedLogs = JSON.parse(logsData.result.content[0].text);
    expect(parsedLogs.chunks.some((c: any) => c.text.includes("SELF_CONTAINED_TEST_SUCCESS"))).toBe(true);

    // 6. Project List via MCP
    const projListRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req_plist",
        method: "tools/call",
        params: {
          name: "localbridge_project_list",
          arguments: {},
        },
      }),
    });
    expect(projListRes.ok).toBe(true);
    const projListData = (await projListRes.json()) as any;
    expect(projListData.result.content[0].text).toContain("proj_clean_env");

    // 7. File Patch via MCP
    const readForHashRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req_read_hash",
        method: "tools/call",
        params: {
          name: "localbridge_file_read",
          arguments: {
            projectId: "proj_clean_env",
            path: "index.js",
          },
        },
      }),
    });
    const readHashData = (await readForHashRes.json()) as any;
    const parsedReadHash = JSON.parse(readHashData.result.content[0].text);
    const expectedHash = parsedReadHash.contentHash;

    const patchRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req_patch",
        method: "tools/call",
        params: {
          name: "localbridge_file_patch",
          arguments: {
            projectId: "proj_clean_env",
            path: "index.js",
            expectedHash,
            replacements: [
              {
                search: "SELF_CONTAINED_TEST_SUCCESS",
                replace: "PATCHED_IN_CLEAN_ENVIRONMENT",
              },
            ],
          },
        },
      }),
    });
    expect(patchRes.ok).toBe(true);
    const patchBody = (await patchRes.json()) as any;
    if (patchBody.result?.isError) {
      console.error("PATCH_ERROR:", patchBody.result.content[0]?.text);
    }
    expect(patchBody.result?.isError).toBeFalsy();

    const updatedContent = fs.readFileSync(path.join(projectDir, "index.js"), "utf-8");
    expect(updatedContent).toContain("PATCHED_IN_CLEAN_ENVIRONMENT");
  }, 30000);
});

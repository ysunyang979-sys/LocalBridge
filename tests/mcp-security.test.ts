import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Security, Access Modes & Path Privacy", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let readOnlyDir: string;
  let noExecDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let runner: LocalBridgeRunner;

  let readOnlyProjectId: string;
  let noExecProjectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-sec-"));
    dbFilePath = path.join(tmpDir, "mcp-sec.db");
    readOnlyDir = path.join(tmpDir, "readonly-repo");
    noExecDir = path.join(tmpDir, "noexec-repo");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    fs.mkdirSync(readOnlyDir, { recursive: true });
    fs.mkdirSync(noExecDir, { recursive: true });

    fs.writeFileSync(path.join(readOnlyDir, "ro.txt"), "read-only content", "utf-8");
    fs.writeFileSync(path.join(noExecDir, "main.js"), "console.log('hi');", "utf-8");
    fs.writeFileSync(
      path.join(noExecDir, "package.json"),
      JSON.stringify({ name: "noexec-app", scripts: { test: "node main.js" } }, null, 2),
      "utf-8"
    );

    // 1. Start Server
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const addressInfo = serverInstance.app.server.address();
    serverPort = typeof addressInfo === "object" && addressInfo ? addressInfo.port : 0;

    // 2. Tokens
    const mcpTokenRecord = serverInstance.tokenService.createToken({
      type: "mcp",
      name: "mcp-sec-client",
      scopes: ["project:read", "project:write"],
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      type: "runner",
      name: "mcp-sec-runner",
    });
    runnerToken = runnerTokenRecord.token;

    // 3. Start Runner with configured project access/execution modes
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Sec-Integration-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const roProj = runner.projectRegistry.add(readOnlyDir, {
      name: "readonly-project",
      accessMode: "read-only",
      executionMode: "disabled",
    });
    readOnlyProjectId = roProj.id;

    const noExecProj = runner.projectRegistry.add(noExecDir, {
      name: "noexec-project",
      accessMode: "read-write",
      executionMode: "disabled",
    });
    noExecProjectId = noExecProj.id;

    await runner.start();

    // 4. Wait for runner registration
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) {
        throw new Error("Runner did not register within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // Give server time to sync runner projects deterministically
    const startSyncWait = Date.now();
    while (serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - startSyncWait > 5000) {
        throw new Error("Projects were not synced within 5000ms");
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // 5. Connect Client
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
      { name: "test-sec-client", version: "1.0.0" },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      } as any
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    try {
      await transport?.close();
    } catch {}
    try {
      await runner?.stop();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    client = null as any;
    transport = null as any;
    runner = null as any;
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("strictly rejects file modification on read-only project", async () => {
    const writeRes = await client.callTool({
      name: "localbridge_file_write",
      arguments: {
        projectId: readOnlyProjectId,
        path: "ro.txt",
        content: "malicious write attempt",
        expectedHash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });

    expect(writeRes.isError).toBe(true);
    expect(writeRes.structuredContent?.code).toBe("PROJECT_READ_ONLY");

    const deleteRes = await client.callTool({
      name: "localbridge_file_delete",
      arguments: {
        projectId: readOnlyProjectId,
        path: "ro.txt",
        expectedHash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });

    expect(deleteRes.isError).toBe(true);
    expect(deleteRes.structuredContent?.code).toBe("PROJECT_READ_ONLY");
  });

  it("strictly rejects command execution on execution-disabled project", async () => {
    const runRes = await client.callTool({
      name: "localbridge_command_run",
      arguments: {
        kind: "node-script",
        projectId: noExecProjectId,
        path: "main.js",
        args: [],
      },
    });

    expect(runRes.isError).toBe(true);
    expect(runRes.structuredContent?.code).toBe("PROJECT_EXECUTION_DISABLED");

    const testRes = await client.callTool({
      name: "localbridge_test_start",
      arguments: {
        projectId: noExecProjectId,
      },
    });

    expect(testRes.isError).toBe(true);
    expect(testRes.structuredContent?.code).toBe("PROJECT_EXECUTION_DISABLED");
  });

  it("strictly shields physical host filesystem paths from MCP responses", async () => {
    // 1. Check localbridge_project_list doesn't leak physical path
    const listRes = await client.callTool({
      name: "localbridge_project_list",
      arguments: {},
    });
    const listText = (listRes.content as any)[0].text;
    expect(listText).not.toContain(readOnlyDir);
    expect(listText).not.toContain(noExecDir);
    expect(listText).not.toContain(tmpDir);

    // 2. Check path traversal error doesn't leak physical path
    const traversalRes = await client.callTool({
      name: "localbridge_file_read",
      arguments: {
        projectId: readOnlyProjectId,
        path: "../../../outside.txt",
      },
    });
    expect(traversalRes.isError).toBe(true);
    const traversalText = (traversalRes.content as any)[0].text;
    expect(traversalText).not.toContain(tmpDir);
    expect(traversalText).not.toContain(readOnlyDir);
    expect(traversalRes.structuredContent?.code).toBe("PATH_TRAVERSAL");
  });
});

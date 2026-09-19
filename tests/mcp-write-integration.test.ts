import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Filesystem Write & Git Diff Workflow Integration", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-write-"));
    dbFilePath = path.join(tmpDir, "mcp-write.db");
    projectDir = path.join(tmpDir, "write-repo");
    runnerStatePath = path.join(tmpDir, "runner-state.json");
    runnerProjectsPath = path.join(tmpDir, "projects.json");

    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize git repository
    execFileSync("git", ["init"], { cwd: projectDir });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: projectDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir });

    fs.writeFileSync(
      path.join(projectDir, "app.ts"),
      'export function main() {\n  console.log("version 1");\n}\n',
      "utf-8"
    );
    execFileSync("git", ["add", "app.ts"], { cwd: projectDir });
    execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: projectDir });

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
      name: "mcp-write-client",
      scopes: ["project:read", "project:write"],
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      type: "runner",
      name: "mcp-write-runner",
    });
    runnerToken = runnerTokenRecord.token;

    // 3. Start Runner with read-write project
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Write-Integration-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "write-test-project",
      accessMode: "read-write",
      executionMode: "safe-only",
    });
    projectId = authorized.id;

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
      { name: "test-write-client", version: "1.0.0" },
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

  it("executes transactional read -> patch -> diff cycle cleanly", async () => {
    // 1. Read existing file and obtain expected hash
    const readRes = await client.callTool({
      name: "localbridge_file_read",
      arguments: { projectId, path: "app.ts" },
    });
    expect(readRes.isError).toBeFalsy();
    const readParsed = JSON.parse((readRes.content as any)[0].text);
    const initialHash = readParsed.contentHash;
    const initialContent = readParsed.lines.map((l: any) => l.text).join("\n");
    expect(initialContent).toContain("version 1");

    // 2. Patch file with conflict-detection hash
    const newContent = 'export function main() {\n  console.log("version 2 - patched by MCP");\n}\n';
    const patchRes = await client.callTool({
      name: "localbridge_file_write",
      arguments: {
        projectId,
        path: "app.ts",
        content: newContent,
        expectedHash: initialHash,
      },
    });
    expect(patchRes.isError).toBeFalsy();
    const patchParsed = JSON.parse((patchRes.content as any)[0].text);
    expect(patchParsed.newHash).toBeDefined();
    expect(patchParsed.newHash).not.toBe(initialHash);

    // 3. Verify file content changed
    const verifyRead = await client.callTool({
      name: "localbridge_file_read",
      arguments: { projectId, path: "app.ts" },
    });
    const verifyParsed = JSON.parse((verifyRead.content as any)[0].text);
    const verifiedContent = verifyParsed.lines.map((l: any) => l.text).join("\n");
    expect(verifiedContent).toContain("version 2 - patched by MCP");

    // 4. Verify git diff reflects the changes
    const diffRes = await client.callTool({
      name: "localbridge_git_diff",
      arguments: { projectId },
    });
    expect(diffRes.isError).toBeFalsy();
    const diffParsed = JSON.parse((diffRes.content as any)[0].text);
    expect(diffParsed.diff).toContain("version 2 - patched by MCP");
  });

  it("rejects write when expectedHash conflicts with actual file state", async () => {
    const conflictRes = await client.callTool({
      name: "localbridge_file_write",
      arguments: {
        projectId,
        path: "app.ts",
        content: "conflict overwrite",
        expectedHash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });

    expect(conflictRes.isError).toBe(true);
    expect((conflictRes.content as any)[0].text).toContain("Conflict");
  });

  it("creates and deletes a file via localbridge_file_create and localbridge_file_delete", async () => {
    // 1. Create file
    const createRes = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "temp_created.txt",
        content: "created through MCP",
      },
    });
    expect(createRes.isError).toBeFalsy();
    const createParsed = JSON.parse((createRes.content as any)[0].text);
    expect(createParsed.newHash).toBeDefined();

    // 2. Delete file
    const deleteRes = await client.callTool({
      name: "localbridge_file_delete",
      arguments: {
        projectId,
        path: "temp_created.txt",
        expectedHash: createParsed.newHash,
      },
    });
    expect(deleteRes.isError).toBeFalsy();
    const deleteParsed = JSON.parse((deleteRes.content as any)[0].text);
    expect(deleteParsed.deleted).toBe(true);
  });
});

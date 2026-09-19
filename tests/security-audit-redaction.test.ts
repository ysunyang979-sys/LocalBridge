import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { createLogger, loadConfig } from "@localbridge/shared";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";

describe("Phase 12 - Security Audit Redaction & Parameter Policy", () => {
  let tmpDir: string;
  let serverInstance: BuiltAppResult;
  let runner: LocalBridgeRunner;
  let serverPort: number;
  let runnerToken: string;
  let mcpToken: string;
  let testProjectDir: string;
  let testProjectId: string;

  const CANARY_MARKER = "SUPER_SECRET_AUDIT_MARKER_123";

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-audit-redact-test-"));
    const dbPath = path.join(tmpDir, "server.db");
    const runnerStateDir = path.join(tmpDir, "runner-state");
    testProjectDir = path.join(tmpDir, "project-a");
    fs.mkdirSync(runnerStateDir, { recursive: true });
    fs.mkdirSync(testProjectDir, { recursive: true });

    // Initialize package.json and a target file in test project
    fs.writeFileSync(
      path.join(testProjectDir, "package.json"),
      JSON.stringify({ name: "project-a", scripts: { "secret-test": `echo ${CANARY_MARKER}` } }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(testProjectDir, "secret.txt"),
      "initial safe content\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(testProjectDir, "script.js"),
      "console.log('secret runner argument:', process.argv[2]);\n",
      "utf-8"
    );

    const baseConfig = loadConfig({
      configPath: path.join(tmpDir, "config.json"),
      cliArgs: ["--port", "0", "--db-path", dbPath],
    });

    serverInstance = await buildApp({
      config: baseConfig,
      enableLogging: false,
    });

    await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const address = serverInstance.app.server.address();
    serverPort = typeof address === "object" && address ? address.port : 18080;

    // Mint Runner and MCP tokens
    const createdRunnerToken = serverInstance.tokenService.createToken({
      name: "Test Runner Token",
      type: "runner",
    });
    runnerToken = createdRunnerToken.token;

    const createdMcpToken = serverInstance.tokenService.createToken({
      name: "Test MCP Token",
      type: "mcp",
    });
    mcpToken = createdMcpToken.token;

    // Start Runner and register project
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      name: "Audit-Redact-Runner",
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      statePath: path.join(runnerStateDir, "runner.json"),
      projectsPath: path.join(runnerStateDir, "projects.json"),
      reconnect: { enabled: false },
      logging: { level: "silent", pretty: false },
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);
    const record = runner.projectRegistry.add(testProjectDir, {
      name: "Project A",
      accessMode: "read-write",
    });
    runner.projectRegistry.setExecutionMode(record.id, "project-code");
    testProjectId = record.id;

    await runner.start();

    // Wait for runner registration and project sync
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 5000) throw new Error("Runner did not connect within 5000ms");
      await new Promise((r) => setTimeout(r, 50));
    }
    const syncWait = Date.now();
    while (serverInstance.projectService.listProjects().length === 0) {
      if (Date.now() - syncWait > 5000) throw new Error("Project not synced within 5000ms");
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterEach(async () => {
    if (runner) {
      await runner.stop();
    }
    if (serverInstance?.app) {
      await serverInstance.app.close();
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("strictly omits sensitive file patches, command args, and stdout from audit logs (Canary Redaction Test)", async () => {
    // 1. Execute file creation via MCP containing CANARY_MARKER in file content
    const createRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${mcpToken}`,
        "mcp-protocol-version": "2026-07-28",
        accept: "application/json, text/event-stream",
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-create-1",
        method: "tools/call",
        params: {
          name: "localbridge_file_create",
          arguments: {
            projectId: testProjectId,
            path: "canary.txt",
            content: `TOP_SECRET_FILE_CONTENT_${CANARY_MARKER}\n`,
          },
        },
      }),
    });

    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as any;
    expect(createJson.error).toBeUndefined();

    // 2. Execute command via MCP containing CANARY_MARKER in command arguments
    const cmdRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${mcpToken}`,
        "mcp-protocol-version": "2026-07-28",
        accept: "application/json, text/event-stream",
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-cmd-1",
        method: "tools/call",
        params: {
          name: "localbridge_command_run",
          arguments: {
            kind: "node-script",
            projectId: testProjectId,
            path: "script.js",
            args: [`--canary=${CANARY_MARKER}`],
          },
        },
      }),
    });

    expect(cmdRes.status).toBe(200);
    const cmdJson = (await cmdRes.json()) as any;
    expect(cmdJson.error).toBeUndefined();

    // 3. Inspect in-memory audit ring buffer via McpContext
    const auditEvents = serverInstance.mcpContext.getAuditEvents(100);
    expect(auditEvents.length).toBeGreaterThan(0);

    // Serialize all audit events to string and assert CANARY_MARKER does NOT exist
    const serializedAuditEvents = JSON.stringify(auditEvents);
    expect(serializedAuditEvents).not.toContain(CANARY_MARKER);

    // 4. Verify each audit record conforms strictly to SafeAuditMetadata whitelist
    for (const event of auditEvents) {
      const allowedKeys = new Set([
        "id",
        "timestamp",
        "event",
        "principalId",
        "authType",
        "toolName",
        "projectId",
        "runnerId",
        "relativePath",
        "durationMs",
        "resultStatus",
        "errorCode",
      ]);
      for (const key of Object.keys(event)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      // Ensure no raw params or patch or stdout field is attached
      expect((event as any).patch).toBeUndefined();
      expect((event as any).arguments).toBeUndefined();
      expect((event as any).params).toBeUndefined();
      expect((event as any).stdout).toBeUndefined();
      expect((event as any).stderr).toBeUndefined();
      expect((event as any).token).toBeUndefined();
    }

    // 5. Query /api/audit endpoint (used by Desktop Activity page) and assert CANARY_MARKER is absent
    const apiAuditRes = await serverInstance.app.inject({
      method: "GET",
      url: "/api/audit",
    });
    expect(apiAuditRes.statusCode).toBe(200);
    expect(apiAuditRes.body).not.toContain(CANARY_MARKER);

    // 6. Inspect SQLite database: verify NO tables or columns store CANARY_MARKER
    const sqliteTables = serverInstance.db.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];

    for (const table of sqliteTables) {
      if (table.name.startsWith("sqlite_")) continue;
      const rows = serverInstance.db.db.prepare(`SELECT * FROM ${table.name}`).all();
      const serializedRows = JSON.stringify(rows);
      expect(serializedRows).not.toContain(CANARY_MARKER);
    }
  });
});

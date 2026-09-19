import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { TOOL_ANNOTATIONS } from "../apps/server/src/mcp/annotations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Tool Registry & Annotation Audit", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let tools: any[] = [];

  const EXPECTED_23_TOOLS = [
    "localbridge_project_list",
    "localbridge_project_info",
    "localbridge_directory_list",
    "localbridge_file_stat",
    "localbridge_file_read",
    "localbridge_file_create",
    "localbridge_file_write",
    "localbridge_file_patch",
    "localbridge_file_delete",
    "localbridge_file_restore",
    "localbridge_git_info",
    "localbridge_git_status",
    "localbridge_git_diff",
    "localbridge_git_log",
    "localbridge_command_classify",
    "localbridge_command_run",
    "localbridge_job_start",
    "localbridge_job_status",
    "localbridge_job_logs",
    "localbridge_job_cancel",
    "localbridge_job_list",
    "localbridge_build_start",
    "localbridge_test_start",
  ];

  const PROHIBITED_TOOLS = [
    "project_add",
    "project_authorize",
    "project_set_access",
    "project_set_execution",
    "token_create",
    "token_revoke",
    "runner_register",
    "shell_run",
    "raw_command",
    "cmd_run",
    "exec",
    "read_env",
    "read_credentials",
    "dump_config",
    "get_runner_state",
    "system.ping",
    "system.info",
    "runner.hello",
    "rpc.call",
    "localbridge.call",
    "runner.request",
  ];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-tools-"));
    dbFilePath = path.join(tmpDir, "mcp-tools.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;

    const createdMcp = serverInstance.tokenService.createToken({
      name: "mcp-tools-test",
      type: "mcp",
      scopes: ["project:read", "project:write"],
    });
    mcpToken = createdMcp.token;

    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "list_req",
        method: "tools/list",
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    tools = data.result?.tools ?? [];
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("registers exactly 23 official tools on tools/list", () => {
    expect(tools.length).toBe(23);

    const registeredNames = tools.map((t: any) => t.name).sort();
    expect(registeredNames).toEqual([...EXPECTED_23_TOOLS].sort());
  });

  it("strictly prohibits management, execution escape, secret dump, and generic RPC tools", () => {
    const registeredNames = new Set(tools.map((t: any) => t.name));

    for (const prohibited of PROHIBITED_TOOLS) {
      expect(registeredNames.has(prohibited)).toBe(false);
    }
  });

  it("verifies accurate annotations (readOnlyHint, destructiveHint, idempotentHint) for all tools", () => {
    for (const tool of tools) {
      const expectedAnnotation = (TOOL_ANNOTATIONS as any)[tool.name];
      expect(expectedAnnotation).toBeDefined();
      expect(tool.annotations).toMatchObject(expectedAnnotation);
    }
  });

  it("verifies every tool has a non-empty description and valid inputSchema", () => {
    for (const tool of tools) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");
const desktopSrcDir = path.resolve(__dirname, "../apps/desktop/src");

describe("MCP Tools Production Count Parity (62 Tools)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-count-test-"));
    dbFilePath = path.join(tmpDir, "skills_count.db");

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

  it("MCP_TOOL_SCOPE policy table defines exactly 87 tools", () => {
    const totalTools = Object.keys(MCP_TOOL_SCOPE).length;
    expect(totalTools).toBe(87);
    expect(MCP_TOOL_SCOPE["localbridge_skill_list"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_skill_get"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_skill_match"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_laya_status"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_laya_assess"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_environment_detect"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_project_detect"]).toBe("read");
  });

  it("GET /api/mcp/status returns dynamic toolsCount equal to 87", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/mcp/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.toolsCount).toBe(87);
  });

  it("MCP tools/list handler returns exactly 87 registered tools", async () => {
    // Create an MCP client token with read, write, execute scopes
    const token = serverInstance.tokenService.createToken({
      name: "test-mcp-client",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });

    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result).toBeDefined();
    expect(body.result.tools).toBeDefined();
    expect(body.result.tools.length).toBe(87);

    const toolNames = body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("localbridge_skill_list");
    expect(toolNames).toContain("localbridge_skill_get");
    expect(toolNames).toContain("localbridge_skill_match");
    expect(toolNames).toContain("localbridge_laya_status");
    expect(toolNames).toContain("localbridge_laya_assess");
    expect(toolNames).toContain("localbridge_environment_detect");
    expect(toolNames).toContain("localbridge_project_detect");
  });

  it("NexusPulseLoading does not contain hardcoded 'MCP Tools (55)' and defaults to 87", () => {
    const pulseLoadingPath = path.join(desktopSrcDir, "components/NexusPulseLoading.tsx");
    const content = fs.readFileSync(pulseLoadingPath, "utf-8");

    expect(content).not.toContain("MCP Tools (55)");
    expect(content).toMatch(/MCP Tools \(\$\{toolsCount \?\? 87\}\)/);
  });

  it("Sidebar, ControlPage, OverviewPage, SettingsPage do not hardcode 55 tools and default to 87", () => {
    const sidebar = fs.readFileSync(path.join(desktopSrcDir, "components/Sidebar.tsx"), "utf-8");
    const control = fs.readFileSync(path.join(desktopSrcDir, "pages/ControlPage.tsx"), "utf-8");
    const overview = fs.readFileSync(path.join(desktopSrcDir, "pages/OverviewPage.tsx"), "utf-8");
    const settings = fs.readFileSync(path.join(desktopSrcDir, "pages/SettingsPage.tsx"), "utf-8");

    expect(sidebar).not.toMatch(/toolsCount\s*\|\|\s*55/);
    expect(control).not.toMatch(/toolsCount\s*\|\|\s*55/);
    expect(settings).not.toContain("55 tools");
    expect(settings).not.toContain("55 工具");

    expect(sidebar).toContain("toolsCount ?? 87");
    expect(control).toContain("toolsCount ?? 87");
    expect(overview).toContain("toolsCount ?? 87");
  });
});

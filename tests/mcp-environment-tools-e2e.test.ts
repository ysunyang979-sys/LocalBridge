import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/server";
import { RunnerRpcMethods } from "@localbridge/protocol";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import {
  ExecutableRegistry,
  ProjectDetectionService,
} from "../apps/runner/src/process/index.js";
import { registerEnvironmentTools } from "../apps/server/src/mcp/tools/environment.js";
import { hasToolScope, requiredScopeForTool } from "../apps/server/src/mcp/scope-policy.js";

describe("MCP Environment & Project Detection Tools E2E", () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let execRegistry: ExecutableRegistry;
  let projectDetector: ProjectDetectionService;
  let projectId: string;

  let mcpServer: McpServer;
  let toolHandlers: Map<string, Function>;
  let auditEvents: any[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-env-test-"));
    registryPath = path.join(tempDir, "projects.json");
    projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    projectRegistry = new ProjectRegistry(registryPath);
    const rec = projectRegistry.add(projectDir, {
      name: "MCP Env Project",
      accessMode: "read-write",
    });
    projectId = rec.id;

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "test-node-project",
        scripts: { test: "vitest run", build: "vite build" },
      })
    );

    execRegistry = new ExecutableRegistry();
    projectDetector = new ProjectDetectionService(projectRegistry);

    mcpServer = new McpServer({ name: "test-mcp", version: "1.0.0" });
    toolHandlers = new Map();
    auditEvents = [];

    const origRegisterTool = mcpServer.registerTool.bind(mcpServer);
    mcpServer.registerTool = ((name: string, config: any, handler: Function) => {
      toolHandlers.set(name, handler);
      return origRegisterTool(name, config, handler as any);
    }) as any;

    const mockContext: any = {
      resolveProjectRunner: () => "runner_test",
      runnerRegistry: {
        list: () => [{ id: "runner_test" }],
      },
      logAudit: (event: string, meta: any) => {
        auditEvents.push({ event, ...meta });
      },
      request: async (runnerId: string, method: string, params: any) => {
        if (method === RunnerRpcMethods.EnvironmentDetect) {
          return execRegistry.detectEnvironment(params.tools);
        }
        if (method === RunnerRpcMethods.ProjectDetect) {
          return projectDetector.detect(params);
        }
        throw new Error(`Unknown RPC method: ${method}`);
      },
    };

    registerEnvironmentTools(mcpServer, mockContext);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("Scope Policy & Annotations", () => {
    it("binds both tools to 'read' scope strictly", () => {
      expect(requiredScopeForTool("localbridge_environment_detect")).toBe("read");
      expect(requiredScopeForTool("localbridge_project_detect")).toBe("read");

      expect(hasToolScope(["read"], "localbridge_environment_detect")).toBe(true);
      expect(hasToolScope(["write"], "localbridge_environment_detect")).toBe(false);
      expect(hasToolScope(["execute"], "localbridge_environment_detect")).toBe(false);

      expect(hasToolScope(["read"], "localbridge_project_detect")).toBe(true);
      expect(hasToolScope(["write"], "localbridge_project_detect")).toBe(false);
      expect(hasToolScope(["execute"], "localbridge_project_detect")).toBe(false);
    });
  });

  describe("localbridge_environment_detect execution", () => {
    it("returns formatted MCP tool result with detected host tools", async () => {
      const handler = toolHandlers.get("localbridge_environment_detect");
      expect(handler).toBeDefined();

      const response = await handler!({ tools: ["node", "git"] });
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe("text");

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.tools).toBeDefined();
      expect(parsed.tools.length).toBe(2);
      expect(parsed.tools[0].tool).toBe("node");
      expect(parsed.tools[0].installed).toBe(true);
      expect(parsed.tools[1].tool).toBe("git");
      expect(parsed.tools[1].installed).toBe(true);

      // Verify audit logs
      const startAudit = auditEvents.find((e) => e.event === "mcp_tool_started" && e.toolName === "localbridge_environment_detect");
      const completeAudit = auditEvents.find((e) => e.event === "mcp_tool_completed" && e.toolName === "localbridge_environment_detect");
      expect(startAudit).toBeDefined();
      expect(completeAudit).toBeDefined();
      expect(completeAudit.resultStatus).toBe("success");
    });
  });

  describe("localbridge_project_detect execution", () => {
    it("returns formatted MCP tool result with project inspection", async () => {
      const handler = toolHandlers.get("localbridge_project_detect");
      expect(handler).toBeDefined();

      const response = await handler!({ projectId });
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe("text");

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.projectId).toBe(projectId);
      expect(parsed.projectType).toBe("node");
      expect(parsed.configFiles).toContain("package.json");
      expect(parsed.scripts.test).toBe("vitest run");
      expect(parsed.scripts.build).toBe("vite build");
      expect(parsed.recommendedCommands.length).toBeGreaterThan(0);

      // Verify audit logs
      const startAudit = auditEvents.find((e) => e.event === "mcp_tool_started" && e.toolName === "localbridge_project_detect");
      const completeAudit = auditEvents.find((e) => e.event === "mcp_tool_completed" && e.toolName === "localbridge_project_detect");
      expect(startAudit).toBeDefined();
      expect(completeAudit).toBeDefined();
      expect(completeAudit.resultStatus).toBe("success");
    });
  });
});

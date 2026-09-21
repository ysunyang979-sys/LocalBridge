import { describe, expect, it } from "vitest";
import { MCP_TOOL_SCOPE, requiredScopeForTool } from "../apps/server/src/mcp/scope-policy.js";
import { TOOL_ANNOTATIONS } from "../apps/server/src/mcp/annotations.js";
import { createLocalBridgeMcpServer } from "../apps/server/src/mcp/server.js";
import { McpContext } from "../apps/server/src/mcp/context.js";
import { ServerProjectService } from "../apps/server/src/runner/project-service.js";
import { RunnerRegistry } from "../apps/server/src/runner/registry.js";
import { RunnerRpcService } from "../apps/server/src/runner/rpc-service.js";

describe("Laya Tool Registry & Scope Parity Suite", () => {
  it("verifies MCP_TOOL_SCOPE has exactly 64 registered tools", () => {
    const tools = Object.keys(MCP_TOOL_SCOPE);
    expect(tools.length).toBe(64);
  });

  it("verifies both Laya tools are registered with 'read' scope", () => {
    expect(MCP_TOOL_SCOPE["localbridge_laya_status"]).toBe("read");
    expect(MCP_TOOL_SCOPE["localbridge_laya_assess"]).toBe("read");
    expect(requiredScopeForTool("localbridge_laya_status")).toBe("read");
    expect(requiredScopeForTool("localbridge_laya_assess")).toBe("read");
  });

  it("verifies TOOL_ANNOTATIONS declares readOnlyHint: true for both Laya tools", () => {
    expect(TOOL_ANNOTATIONS["localbridge_laya_status"]).toBeDefined();
    expect(TOOL_ANNOTATIONS["localbridge_laya_status"].readOnlyHint).toBe(true);

    expect(TOOL_ANNOTATIONS["localbridge_laya_assess"]).toBeDefined();
    expect(TOOL_ANNOTATIONS["localbridge_laya_assess"].readOnlyHint).toBe(true);
  });

  it("verifies McpServer tools list registers all 64 tools", () => {
    const mockDb = {
      prepare: () => ({
        run: () => {},
        get: () => null,
        all: () => [],
      }),
    } as any;
    const runnerRegistry = new RunnerRegistry();
    const projectService = new ServerProjectService(mockDb, runnerRegistry);
    const rpcService = new RunnerRpcService(runnerRegistry);
    const context = new McpContext({
      projectService,
      runnerRegistry,
      rpcService,
    });

    const server = createLocalBridgeMcpServer(context);
    const registeredTools = (server as any)._registeredTools || (server as any).registeredTools || {};
    const toolNames = Object.keys(registeredTools);
    expect(toolNames.length).toBe(64);
    expect(toolNames).toContain("localbridge_laya_status");
    expect(toolNames).toContain("localbridge_laya_assess");
  });
});

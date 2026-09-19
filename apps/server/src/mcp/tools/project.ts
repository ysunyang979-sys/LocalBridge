import { z } from "zod";
import {
  ProjectInfoParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerProjectTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_project_list
  server.registerTool(
    "localbridge_project_list",
    {
      description:
        "List all authorized local projects available to this LocalBridge server with their current status and access modes.",
      inputSchema: toMcpSchema(z.object({})),
      annotations: TOOL_ANNOTATIONS.localbridge_project_list,
    },
    async (_args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_project_list",
        });

        const projects = context.projectService.listProjects();

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_project_list",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({ projects });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_project_list",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_project_info
  server.registerTool(
    "localbridge_project_info",
    {
      description:
        "Inspect the detailed health, configuration, and access/execution modes of an authorized project.",
      inputSchema: toMcpSchema(ProjectInfoParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_project_info,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_project_info",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProjectInfo,
          { projectId }
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_project_info",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_project_info",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

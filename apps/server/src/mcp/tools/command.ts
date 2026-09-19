import {
  CommandClassifyParamsSchema,
  CommandRunParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerCommandTools(server: McpServer, context: McpContext): void {
  // 15. localbridge_command_classify
  server.registerTool(
    "localbridge_command_classify",
    {
      description:
        "Perform pre-flight risk evaluation and permission checking on a structured CommandSpec before execution.",
      inputSchema: toMcpSchema(CommandClassifyParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_command_classify,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_command_classify",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CommandClassify,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_command_classify",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_command_classify",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 16. localbridge_command_run
  server.registerTool(
    "localbridge_command_run",
    {
      description:
        "Execute an authorized, classified command (tool version, node script, python script, or package script) within project bounds.",
      inputSchema: toMcpSchema(CommandRunParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_command_run,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_command_run",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CommandRun,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_command_run",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_command_run",
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

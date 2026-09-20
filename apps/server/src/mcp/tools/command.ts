import {
  CommandClassifyToolInputSchema,
  CommandRunToolInputSchema,
  RunnerRpcMethods,
  sanitizeCommandSpec,
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
      inputSchema: toMcpSchema(CommandClassifyToolInputSchema),
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
        const sanitizedArgs = sanitizeCommandSpec(args);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CommandClassify,
          sanitizedArgs
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
      inputSchema: toMcpSchema(CommandRunToolInputSchema),
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
        const sanitizedArgs = sanitizeCommandSpec(args);

        context.recordSessionEvent?.({
          projectId,
          eventType: "COMMAND_STARTED",
          source: "mcp",
          refType: "command",
          summary: { kind: sanitizedArgs.kind },
        });

        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CommandRun,
          sanitizedArgs
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_command_run",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "COMMAND_FINISHED",
          source: "mcp",
          refType: "command",
          summary: { kind: sanitizedArgs.kind, exitCode: result.exitCode },
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

import {
  TerminalStartParamsSchema,
  TerminalWriteParamsSchema,
  TerminalReadParamsSchema,
  TerminalResizeParamsSchema,
  TerminalStatusParamsSchema,
  TerminalStopParamsSchema,
  TerminalListParamsSchema,
  RunnerRpcMethods,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

function resolveRunner(context: McpContext, projectId?: string): string {
  if (projectId) {
    return context.resolveProjectRunner(projectId);
  }
  const runners = context.runnerRegistry.list();
  const firstRunner = runners[0];
  if (!firstRunner) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.RUNNER_OFFLINE,
      "No runner is currently connected and online"
    );
  }
  return firstRunner.id;
}

export function registerTerminalTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_terminal_start
  server.registerTool(
    "localbridge_terminal_start",
    {
      description:
        "Start a real persistent Terminal session with ConPTY / PTY on the host machine. The terminal session survives Web AI disconnects and supports interactive commands, full ANSI output buffering, and idle timeouts.",
      inputSchema: toMcpSchema(TerminalStartParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_start,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_terminal_start",
          projectId,
        });

        const runnerId = resolveRunner(context, projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalStart,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_terminal_start",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_terminal_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_terminal_write
  server.registerTool(
    "localbridge_terminal_write",
    {
      description:
        "Send interactive input or commands to a persistent Terminal session. Evaluates input commands for security and risk classification. Dangerous commands require approval.",
      inputSchema: toMcpSchema(TerminalWriteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_write,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_terminal_write",
        });

        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalWrite,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_terminal_write",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_terminal_write",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_terminal_read
  server.registerTool(
    "localbridge_terminal_read",
    {
      description:
        "Read buffered output from a persistent Terminal session. Supports incremental offset-based reading and resets idle timeout upon interaction.",
      inputSchema: toMcpSchema(TerminalReadParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_read,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_terminal_read",
        });

        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalRead,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_terminal_read",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_terminal_read",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_terminal_resize
  server.registerTool(
    "localbridge_terminal_resize",
    {
      description: "Resize the terminal columns and rows dimensions of an active terminal session.",
      inputSchema: toMcpSchema(TerminalResizeParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_resize,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalResize,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_terminal_status
  server.registerTool(
    "localbridge_terminal_status",
    {
      description:
        "Get detailed status, state (running, idle, stopped), PID, uptime, and buffer size of a terminal session. Revives sessions in grace-period back to running.",
      inputSchema: toMcpSchema(TerminalStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_status,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalStatus,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_terminal_stop
  server.registerTool(
    "localbridge_terminal_stop",
    {
      description: "Terminate an active Terminal session and safely clean up its process tree.",
      inputSchema: toMcpSchema(TerminalStopParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_stop,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalStop,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_terminal_list
  server.registerTool(
    "localbridge_terminal_list",
    {
      description: "List all persistent Terminal sessions filtered by project ID or state.",
      inputSchema: toMcpSchema(TerminalListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_terminal_list,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TerminalList,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

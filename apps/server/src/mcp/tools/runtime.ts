import {
  RuntimeStartParamsSchema,
  RuntimeListParamsSchema,
  RuntimeStatusParamsSchema,
  RuntimeLogsParamsSchema,
  RuntimeRestartParamsSchema,
  RuntimeStopParamsSchema,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerRuntimeTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_runtime_start
  server.registerTool(
    "localbridge_runtime_start",
    {
      description:
        "Start a long-lived persistent runtime process (e.g. dev server, file watcher, compiler watch, or background process) for an authorized project.",
      inputSchema: toMcpSchema(RuntimeStartParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_runtime_start,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.persistentRuntimeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "ServerPersistentRuntimeManager is not initialized"
          );
        }

        if (context.isPaused()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.AI_ACCESS_PAUSED,
            "LocalBridge AI access is paused by local user"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_runtime_start",
          projectId,
        });

        const result = await context.persistentRuntimeManager.startRuntime(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_runtime_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_runtime_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_runtime_list
  server.registerTool(
    "localbridge_runtime_list",
    {
      description:
        "List persistent runtimes, optionally filtered by projectId, sessionId, worktreeId, or state.",
      inputSchema: toMcpSchema(RuntimeListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_runtime_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.persistentRuntimeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "ServerPersistentRuntimeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_runtime_list",
          projectId,
        });

        const result = await context.persistentRuntimeManager.listRuntimes(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_runtime_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_runtime_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_runtime_status
  server.registerTool(
    "localbridge_runtime_status",
    {
      description:
        "Get the status, generation, PID, exit code, and uptime of a persistent runtime.",
      inputSchema: toMcpSchema(RuntimeStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_runtime_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (!context.persistentRuntimeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "ServerPersistentRuntimeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_runtime_status",
        });

        const result = await context.persistentRuntimeManager.getRuntimeStatus(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_runtime_status",
          projectId: result.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_runtime_status",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_runtime_logs
  server.registerTool(
    "localbridge_runtime_logs",
    {
      description:
        "Retrieve paginated output logs for a persistent runtime, supporting generation filtering and sequence-based cursors.",
      inputSchema: toMcpSchema(RuntimeLogsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_runtime_logs,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (!context.persistentRuntimeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "ServerPersistentRuntimeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_runtime_logs",
        });

        const result = await context.persistentRuntimeManager.getRuntimeLogs(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_runtime_logs",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_runtime_logs",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_runtime_restart
  server.registerTool(
    "localbridge_runtime_restart",
    {
      description:
        "Restart a persistent runtime with a new generation while preserving its launch configuration.",
      inputSchema: toMcpSchema(RuntimeRestartParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_runtime_restart,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (!context.persistentRuntimeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "ServerPersistentRuntimeManager is not initialized"
          );
        }

        if (context.isPaused()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.AI_ACCESS_PAUSED,
            "LocalBridge AI access is paused by local user"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_runtime_restart",
        });

        const result = await context.persistentRuntimeManager.restartRuntime(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_runtime_restart",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_runtime_restart",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_runtime_stop
  server.registerTool(
    "localbridge_runtime_stop",
    {
      description:
        "Gracefully stop a persistent runtime (with SIGTERM and fallback hard tree kill) without requiring operator approval.",
      inputSchema: toMcpSchema(RuntimeStopParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_runtime_stop,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (!context.persistentRuntimeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "ServerPersistentRuntimeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_runtime_stop",
        });

        const result = await context.persistentRuntimeManager.stopRuntime(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_runtime_stop",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_runtime_stop",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

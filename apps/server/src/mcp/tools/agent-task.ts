import {
  AgentTaskCreateParamsSchema,
  AgentTaskStatusParamsSchema,
  AgentTaskLogsParamsSchema,
  AgentTaskCancelParamsSchema,
  AgentTaskPauseParamsSchema,
  AgentTaskResumeParamsSchema,
  AgentTaskListParamsSchema,
  AgentTaskApproveParamsSchema,
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
  const first = runners[0];
  if (!first) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.RUNNER_OFFLINE,
      "No runner is currently connected and online"
    );
  }
  return first.id;
}

export function registerAgentTaskTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_agent_task_create
  server.registerTool(
    "localbridge_agent_task_create",
    {
      description:
        "Create a long-term autonomous Agent Task with hard resource governance limits (wall time, CPU/memory, action budget, disk quota, failure loop detection).",
      inputSchema: toMcpSchema(AgentTaskCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_create,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_agent_task_create",
          projectId,
        });

        const runnerId = resolveRunner(context, projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskCreate,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_agent_task_create",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_agent_task_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_agent_task_status
  server.registerTool(
    "localbridge_agent_task_status",
    {
      description:
        "Query the real-time status of an Agent Task, including current phase, resource usage, iteration counters, pending approvals, and latest checkpoint.",
      inputSchema: toMcpSchema(AgentTaskStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_status,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskStatus,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_agent_task_logs
  server.registerTool(
    "localbridge_agent_task_logs",
    {
      description:
        "Fetch sequence-based incremental execution logs for an Agent Task (observation, plan, action, command, terminal, process, port, approval, checkpoint).",
      inputSchema: toMcpSchema(AgentTaskLogsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_logs,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskLogs,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_agent_task_cancel
  server.registerTool(
    "localbridge_agent_task_cancel",
    {
      description:
        "Cancel an active Agent Task, stop its decision loop, and terminate all agent-owned runtimes, terminals, and processes.",
      inputSchema: toMcpSchema(AgentTaskCancelParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_cancel,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskCancel,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_agent_task_pause
  server.registerTool(
    "localbridge_agent_task_pause",
    {
      description:
        "Pause the Agent decision loop while keeping all owned development terminals, runtimes, and processes running.",
      inputSchema: toMcpSchema(AgentTaskPauseParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_pause,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskPause,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_agent_task_resume
  server.registerTool(
    "localbridge_agent_task_resume",
    {
      description:
        "Resume a paused Agent Task with fresh observation and state reconciliation against live OS processes and ports.",
      inputSchema: toMcpSchema(AgentTaskResumeParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_resume,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskResume,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_agent_task_list
  server.registerTool(
    "localbridge_agent_task_list",
    {
      description: "List long-term Agent Tasks filtered by project ID or state.",
      inputSchema: toMcpSchema(AgentTaskListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_list,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskList,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 8. localbridge_agent_task_approve
  server.registerTool(
    "localbridge_agent_task_approve",
    {
      description: "Approve or reject a pending security approval required by an Agent Task.",
      inputSchema: toMcpSchema(AgentTaskApproveParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_approve,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskApprove,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

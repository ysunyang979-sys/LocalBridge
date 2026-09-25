import {
  ProcessListParamsSchema,
  ProcessStatusParamsSchema,
  ProcessKillParamsSchema,
  ProcessTreeParamsSchema,
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

export function registerProcessTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_process_list
  server.registerTool(
    "localbridge_process_list",
    {
      description:
        "List running OS processes on the host with ownership evaluation (OWNED, VERIFIED_DERIVED, PROBABLE, UNOWNED, SYSTEM, FOREIGN), resource IDs, CPU/memory, and listening ports.",
      inputSchema: toMcpSchema(ProcessListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_process_list,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProcessList,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_process_status
  server.registerTool(
    "localbridge_process_status",
    {
      description:
        "Inspect detailed status of a specific process by PID, including process tree children, system protected flags, and verified ownership score.",
      inputSchema: toMcpSchema(ProcessStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_process_status,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProcessStatus,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_process_kill
  server.registerTool(
    "localbridge_process_kill",
    {
      description:
        "Terminate a process by PID. Enforces strict process ownership verification: Nexus-owned processes are safely terminated; System processes are blocked; Unowned/external processes require explicit approval.",
      inputSchema: toMcpSchema(ProcessKillParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_process_kill,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_process_kill",
          pid: args.pid,
        });

        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProcessKill,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_process_kill",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_process_kill",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_process_tree
  server.registerTool(
    "localbridge_process_tree",
    {
      description:
        "Get a hierarchical process tree structure starting from a root PID or filtered by project, terminal session, or runtime ID.",
      inputSchema: toMcpSchema(ProcessTreeParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_process_tree,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProcessTree,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

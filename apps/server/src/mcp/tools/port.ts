import {
  PortListParamsSchema,
  PortKillParamsSchema,
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

export function registerPortTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_port_list
  server.registerTool(
    "localbridge_port_list",
    {
      description:
        "Scan active TCP and UDP ports on the host machine. Returns bound port, protocol, binding address, PID, process name, command line, project association, and ownership grade.",
      inputSchema: toMcpSchema(PortListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_port_list,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.PortList,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_port_kill
  server.registerTool(
    "localbridge_port_kill",
    {
      description:
        "Release an occupied port by resolving its listening process and safely terminating it with real-time port and PID ownership verification. Verifies that the port is completely freed.",
      inputSchema: toMcpSchema(PortKillParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_port_kill,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_port_kill",
          port: args.port,
        });

        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.PortKill,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_port_kill",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_port_kill",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

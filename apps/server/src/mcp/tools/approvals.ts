import { z } from "zod";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export const ApprovalStatusParamsSchema = z
  .object({
    approvalId: z
      .string()
      .regex(/^approval_[0-9a-f-]{36}$/i, "Must be a valid approval ID (approval_<UUID>)")
      .describe("The unique identifier of the approval request to inspect."),
  })
  .strict();

export function registerApprovalTools(server: McpServer, context: McpContext): void {
  server.registerTool(
    "localbridge_approval_status",
    {
      description:
        "Check the real-time status of an approval request (returns 'pending', 'approved', 'denied', 'expired', or 'consumed'). Resolvable via chat or Nexus Desktop fallback.",
      inputSchema: toMcpSchema(ApprovalStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_approval_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { approvalId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_approval_status",
        });

        const runners = context.runnerRegistry.list();
        if (runners.length === 0) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.RUNNER_OFFLINE,
            "No runners currently connected to inspect approval status"
          );
        }

        let approvalResult: any = null;
        let matchedRunnerId: string | undefined;

        for (const runner of runners) {
          try {
            const res = await context.request(
              runner.id,
              RunnerRpcMethods.ApprovalGet,
              { approvalId }
            );
            if (res) {
              approvalResult = res;
              matchedRunnerId = runner.id;
              break;
            }
          } catch (err: any) {
            if (err?.code !== LocalBridgeErrorCode.APPROVAL_NOT_FOUND) {
              // Ignore non-matching runner errors
            }
          }
        }

        if (!approvalResult) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.APPROVAL_NOT_FOUND,
            `Approval request "${approvalId}" was not found on any connected runner.`
          );
        }

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_approval_status",
          projectId: approvalResult.projectId,
          runnerId: matchedRunnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          approvalId: approvalResult.id,
          projectId: approvalResult.projectId,
          operation: approvalResult.operation,
          status: approvalResult.status,
          risk: approvalResult.risk,
          summary: approvalResult.summary,
          decisionSource: approvalResult.decisionSource,
          createdAt: approvalResult.createdAt,
          expiresAt: approvalResult.expiresAt,
          resolvedAt: approvalResult.resolvedAt,
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_approval_status",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

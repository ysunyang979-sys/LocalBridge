import {
  GitDiffParamsSchema,
  GitInfoParamsSchema,
  GitLogParamsSchema,
  GitStatusParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerGitTools(server: McpServer, context: McpContext): void {
  // 11. localbridge_git_info
  server.registerTool(
    "localbridge_git_info",
    {
      description:
        "Inspect git repository status, current branch, detached state, and commit hash for an authorized project.",
      inputSchema: toMcpSchema(GitInfoParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_info,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_info",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitInfo,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_info",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_info",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 12. localbridge_git_status
  server.registerTool(
    "localbridge_git_status",
    {
      description:
        "Check working tree status, staged/unstaged changes, untracked files, and branch sync status for an authorized project.",
      inputSchema: toMcpSchema(GitStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_status",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitStatus,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_status",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_status",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 13. localbridge_git_diff
  server.registerTool(
    "localbridge_git_diff",
    {
      description:
        "Generate a unified diff for staged or unstaged changes within an authorized project, with path filtering and security exclusion.",
      inputSchema: toMcpSchema(GitDiffParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_diff,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_diff",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitDiff,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_diff",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_diff",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 14. localbridge_git_log
  server.registerTool(
    "localbridge_git_log",
    {
      description:
        "Inspect recent git commit summaries (hash, author, date, message) with limit bounding for an authorized project.",
      inputSchema: toMcpSchema(GitLogParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_log,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_log",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitLog,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_log",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_log",
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

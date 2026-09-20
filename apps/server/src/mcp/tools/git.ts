import {
  GitBranchCreateToolInputSchema,
  GitBranchSwitchToolInputSchema,
  GitCommitToolInputSchema,
  GitDiffParamsSchema,
  GitInfoParamsSchema,
  GitLogParamsSchema,
  GitStageToolInputSchema,
  GitStatusParamsSchema,
  GitUnstageToolInputSchema,
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

  // 15. localbridge_git_stage
  server.registerTool(
    "localbridge_git_stage",
    {
      description:
        "Stage specified file or directory paths in the index for an authorized project.",
      inputSchema: toMcpSchema(GitStageToolInputSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_stage,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_stage",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitStage,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_stage",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "GIT_STAGE",
          source: "mcp",
          refType: "git",
          summary: { paths: args.paths },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_stage",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 16. localbridge_git_unstage
  server.registerTool(
    "localbridge_git_unstage",
    {
      description:
        "Unstage specified paths from the index without discarding working tree modifications for an authorized project.",
      inputSchema: toMcpSchema(GitUnstageToolInputSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_unstage,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_unstage",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitUnstage,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_unstage",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "GIT_UNSTAGE",
          source: "mcp",
          refType: "git",
          summary: { paths: args.paths },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_unstage",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 17. localbridge_git_branch_create
  server.registerTool(
    "localbridge_git_branch_create",
    {
      description:
        "Create a new local Git branch with strict name validation for an authorized project.",
      inputSchema: toMcpSchema(GitBranchCreateToolInputSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_branch_create,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_branch_create",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitBranchCreate,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_branch_create",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "GIT_BRANCH_CREATED",
          source: "mcp",
          refType: "git",
          summary: { branch: args.branch },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_branch_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 18. localbridge_git_branch_switch
  server.registerTool(
    "localbridge_git_branch_switch",
    {
      description:
        "Switch to an existing local Git branch with dirty worktree conflict detection for an authorized project.",
      inputSchema: toMcpSchema(GitBranchSwitchToolInputSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_branch_switch,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_branch_switch",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitBranchSwitch,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_branch_switch",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "GIT_BRANCH_SWITCHED",
          source: "mcp",
          refType: "git",
          summary: { branch: args.branch },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_branch_switch",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 19. localbridge_git_commit
  server.registerTool(
    "localbridge_git_commit",
    {
      description:
        "Commit currently staged changes with a required commit message for an authorized project.",
      inputSchema: toMcpSchema(GitCommitToolInputSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_git_commit,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_git_commit",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.GitCommit,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_git_commit",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "GIT_COMMIT",
          source: "mcp",
          refType: "git",
          refId: result.commitHash,
          summary: { commitHash: result.commitHash, message: args.message },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_git_commit",
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

import {
  WorktreeCreateParamsSchema,
  WorktreeListParamsSchema,
  WorktreeStatusParamsSchema,
  WorktreeDiffParamsSchema,
  WorktreeRemoveParamsSchema,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerWorktreeTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_worktree_create
  server.registerTool(
    "localbridge_worktree_create",
    {
      description:
        "Create an isolated Git worktree development workspace for an authorized project. If sessionId is provided, binds the worktree to the workflow session so all session operations resolve to the worktree.",
      inputSchema: toMcpSchema(WorktreeCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_worktree_create,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.worktreeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.WORKTREE_INTERNAL_ERROR,
            "ManagedWorktreeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_worktree_create",
          projectId,
        });

        const result = await context.worktreeManager.createWorktree(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_worktree_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_worktree_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_worktree_list
  server.registerTool(
    "localbridge_worktree_list",
    {
      description:
        "List all managed Git worktrees for an authorized project, including their branch names, paths, clean status, and bound sessions.",
      inputSchema: toMcpSchema(WorktreeListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_worktree_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.worktreeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.WORKTREE_INTERNAL_ERROR,
            "ManagedWorktreeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_worktree_list",
          projectId,
        });

        const result = await context.worktreeManager.listWorktrees(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_worktree_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_worktree_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_worktree_status
  server.registerTool(
    "localbridge_worktree_status",
    {
      description:
        "Get detailed status of a managed Git worktree, including clean status, staged/unstaged changes, and commit comparison.",
      inputSchema: toMcpSchema(WorktreeStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_worktree_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.worktreeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.WORKTREE_INTERNAL_ERROR,
            "ManagedWorktreeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_worktree_status",
          projectId,
        });

        const result = await context.worktreeManager.getWorktreeStatus(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_worktree_status",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_worktree_status",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_worktree_diff
  server.registerTool(
    "localbridge_worktree_diff",
    {
      description:
        "Get file diffs for a managed Git worktree (against base branch or working tree).",
      inputSchema: toMcpSchema(WorktreeDiffParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_worktree_diff,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.worktreeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.WORKTREE_INTERNAL_ERROR,
            "ManagedWorktreeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_worktree_diff",
          projectId,
        });

        const result = await context.worktreeManager.getWorktreeDiff(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_worktree_diff",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_worktree_diff",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_worktree_remove
  server.registerTool(
    "localbridge_worktree_remove",
    {
      description:
        "Safely remove a managed Git worktree. Strictly blocked if the worktree has uncommitted changes, active background jobs, pending approvals, or unmerged commits. The branch is never deleted.",
      inputSchema: toMcpSchema(WorktreeRemoveParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_worktree_remove,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.worktreeManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.WORKTREE_INTERNAL_ERROR,
            "ManagedWorktreeManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_worktree_remove",
          projectId,
        });

        const result = await context.worktreeManager.removeWorktree(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_worktree_remove",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_worktree_remove",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

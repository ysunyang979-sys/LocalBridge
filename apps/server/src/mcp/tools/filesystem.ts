import {
  DirectoryListParamsSchema,
  FileCreateParamsSchema,
  FileDeleteParamsSchema,
  FilePatchParamsSchema,
  FileReadParamsSchema,
  FileRestoreParamsSchema,
  FileStatParamsSchema,
  FileWriteParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerFilesystemTools(server: McpServer, context: McpContext): void {
  // 3. localbridge_directory_list
  server.registerTool(
    "localbridge_directory_list",
    {
      description:
        "List directory contents within an authorized project sandbox with opaque cursor pagination and security filtering.",
      inputSchema: toMcpSchema(DirectoryListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_directory_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_directory_list",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DirectoryList,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_directory_list",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_directory_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_file_stat
  server.registerTool(
    "localbridge_file_stat",
    {
      description:
        "Retrieve metadata (type, size, modifiedAt, accessible) for a file or directory within an authorized project.",
      inputSchema: toMcpSchema(FileStatParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_stat,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_stat",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileStat,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_stat",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_stat",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_file_read
  server.registerTool(
    "localbridge_file_read",
    {
      description:
        "Read UTF-8 text file content lines with SHA-256 contentHash and pagination bounding from an authorized project.",
      inputSchema: toMcpSchema(FileReadParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_read,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_read",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileRead,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_read",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_read",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_file_create
  server.registerTool(
    "localbridge_file_create",
    {
      description:
        "Create a new file within an authorized project sandbox. Requires read-write access mode. Fails if file already exists.",
      inputSchema: toMcpSchema(FileCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_create,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_create",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileCreate,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_create",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_file_write
  server.registerTool(
    "localbridge_file_write",
    {
      description:
        "Atomically overwrite an existing file within an authorized project with optimistic concurrency (expectedHash) verification and automated backup creation.",
      inputSchema: toMcpSchema(FileWriteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_write,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_write",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileWrite,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_write",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_write",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 8. localbridge_file_patch
  server.registerTool(
    "localbridge_file_patch",
    {
      description:
        "Apply targeted search-and-replace hunks to an existing file with expectedHash verification and automated backup creation.",
      inputSchema: toMcpSchema(FilePatchParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_patch,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_patch",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FilePatch,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_patch",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_patch",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 9. localbridge_file_delete
  server.registerTool(
    "localbridge_file_delete",
    {
      description:
        "Safely delete a file from an authorized project with expectedHash verification and snapshot backup creation.",
      inputSchema: toMcpSchema(FileDeleteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_delete,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_delete",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileDelete,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_delete",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_delete",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 10. localbridge_file_restore
  server.registerTool(
    "localbridge_file_restore",
    {
      description:
        "Restore a file to an authorized project from a previous operationId snapshot backup.",
      inputSchema: toMcpSchema(FileRestoreParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_restore,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_restore",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileRestore,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_restore",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_restore",
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

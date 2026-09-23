import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";
import { validatePathSandbox } from "../security.js";

export function registerFilesystemTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_directory_list
  server.tool(
    "nexus_directory_list",
    "列出项目指定目录下的子文件与子目录清单",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
      path: z.string().default(".").describe("项目内的相对目录路径，默认为当前根目录 '.'"),
    },
    async ({ projectId, path: relPath }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath || ".",
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_directory_list", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error listing directory: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. nexus_file_read
  server.tool(
    "nexus_file_read",
    "读取项目内指定文本文件的完整内容或分行切片",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
      path: z.string().describe("文件在项目内的相对路径，例如 'src/index.ts' 或 'index.html'"),
      startLine: z.number().optional().describe("起始读取行号（1-indexed），默认从第 1 行开始"),
      maxLines: z.number().optional().describe("最大读取行数（1-500），默认 300 行"),
      offset: z.number().optional().describe("起始行（兼容参数，等同于 startLine）"),
      limit: z.number().optional().describe("读取行数（兼容参数，等同于 maxLines）"),
    },
    async ({ projectId, path: relPath, startLine, maxLines, offset, limit }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const resolvedStartLine = Math.max(1, startLine ?? offset ?? 1);
        const resolvedMaxLines = Math.min(500, Math.max(1, maxLines ?? limit ?? 300));

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath,
          startLine: resolvedStartLine,
          maxLines: resolvedMaxLines,
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_read", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error reading file: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. nexus_file_create
  server.tool(
    "nexus_file_create",
    "在受管项目目录内安全创建新文件",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
      path: z.string().describe("新文件在项目内的相对路径"),
      content: z.string().describe("文件的文本内容"),
    },
    async ({ projectId, path: relPath, content }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath,
          content,
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_create", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error creating file: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 4. nexus_file_write
  server.tool(
    "nexus_file_write",
    "重写或更新项目目录内现有文件的内容",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
      path: z.string().describe("现有文件在项目内的相对路径"),
      content: z.string().describe("新的文本内容"),
    },
    async ({ projectId, path: relPath, content }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);

        if (project.rootPath) {
          const sandbox = validatePathSandbox(project.rootPath, relPath);
          if (!sandbox.valid) {
            return {
              content: [{ type: "text", text: `[Security Error] ${sandbox.error}` }],
              isError: true,
            };
          }
        }

        const args: Record<string, unknown> = {
          projectId: project.id,
          path: relPath,
          content,
        };

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_write", args);

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error writing file: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

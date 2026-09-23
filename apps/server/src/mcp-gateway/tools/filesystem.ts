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
        } else {
          // Reject relative path traversal without rootPath
          const normalized = (relPath || "").replace(/\\/g, "/");
          if (normalized.includes("..")) {
            return {
              content: [{ type: "text", text: `[Security Error] Path traversal blocked: '${relPath}'` }],
              isError: true,
            };
          }
        }

        const downstreamRes = await nexusClient.callNexusTool("localbridge_directory_list", {
          projectId: project.id,
          path: relPath || ".",
        });

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
      path: z.string().describe("文件在项目内的相对路径，例如 'src/index.ts' 或 'package.json'"),
      startLine: z.number().optional().describe("起始读取行号（1-indexed），默认从第 1 行开始"),
      maxLines: z.number().optional().describe("最大读取行数（1-500），默认 300 行"),
    },
    async ({ projectId, path: relPath, startLine, maxLines }) => {
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
        } else {
          const normalized = (relPath || "").replace(/\\/g, "/");
          if (normalized.includes("..")) {
            return {
              content: [{ type: "text", text: `[Security Error] Path traversal blocked: '${relPath}'` }],
              isError: true,
            };
          }
        }

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_read", {
          projectId: project.id,
          path: relPath,
          offset: startLine !== undefined ? startLine : 1,
          limit: maxLines !== undefined ? maxLines : 300,
        });

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
    "在受控项目内创建新文件，并写入初始文本内容（若文件已存在将报错）",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
      path: z.string().describe("新建文件在项目内的相对路径，例如 'src/components/Button.tsx'"),
      content: z.string().describe("文件的完整文本内容"),
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
        } else {
          const normalized = (relPath || "").replace(/\\/g, "/");
          if (normalized.includes("..")) {
            return {
              content: [{ type: "text", text: `[Security Error] Path traversal blocked: '${relPath}'` }],
              isError: true,
            };
          }
        }

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_create", {
          projectId: project.id,
          path: relPath,
          content,
        });

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
    "覆盖写入项目内的指定文件内容（需项目处于可写模式）",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
      path: z.string().describe("待修改文件的相对路径，例如 'src/index.ts'"),
      content: z.string().describe("要写入的新文本内容"),
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
        } else {
          const normalized = (relPath || "").replace(/\\/g, "/");
          if (normalized.includes("..")) {
            return {
              content: [{ type: "text", text: `[Security Error] Path traversal blocked: '${relPath}'` }],
              isError: true,
            };
          }
        }

        const downstreamRes = await nexusClient.callNexusTool("localbridge_file_write", {
          projectId: project.id,
          path: relPath,
          content,
        });

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

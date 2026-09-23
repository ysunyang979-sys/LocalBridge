import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";

export function registerGitTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_git_status
  server.tool(
    "nexus_git_status",
    "查询受管项目的当前 Git 工作区状态（分支、修改状态、未跟踪文件等）",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb' 或 'git-p1b-test'"),
    },
    async ({ projectId }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);
        const downstreamRes = await nexusClient.callNexusTool("localbridge_git_status", {
          projectId: project.id,
        });

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error checking git status: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

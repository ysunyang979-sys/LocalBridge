import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";

export function registerGitTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_git_status
  server.tool(
    "nexus_git_status",
    "查询项目当前的 Git 工作树状态，包括当前分支、暂存区改动与未暂存修改文件",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
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
          content: [{ type: "text", text: `Error fetching git status: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

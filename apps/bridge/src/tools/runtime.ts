import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NexusClient } from "../nexus-client.js";

export function registerRuntimeTools(server: McpServer, nexusClient: NexusClient) {
  // 1. nexus_runtime_list
  server.tool(
    "nexus_runtime_list",
    "查询项目中当前激活或已注册的本地持久化运行时服务列表（如 Web 开发服务器、常驻后台服务）",
    {
      projectId: z.string().describe("项目名称或项目 ID，例如 'Myweb'"),
    },
    async ({ projectId }) => {
      try {
        const project = await nexusClient.resolveProject(projectId);
        const downstreamRes = await nexusClient.callNexusTool("localbridge_runtime_list", {
          projectId: project.id,
        });

        return {
          content: downstreamRes.content as any,
          isError: downstreamRes.isError,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error listing runtimes: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

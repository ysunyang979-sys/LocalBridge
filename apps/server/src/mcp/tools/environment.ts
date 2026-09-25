import {
  EnvironmentDetectParamsSchema,
  ProjectDetectParamsSchema,
  RunnerRpcMethods,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

function resolveRunner(context: McpContext, projectId?: string): string {
  if (projectId) {
    return context.resolveProjectRunner(projectId);
  }
  const runners = context.runnerRegistry.list();
  if (runners.length === 0) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.RUNNER_OFFLINE,
      "No runner is currently connected and online"
    );
  }
  return runners[0].id;
}

export function registerEnvironmentTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_environment_detect
  server.registerTool(
    "localbridge_environment_detect",
    {
      description:
        "Detect installed developer toolchains, compilers, runtimes, package managers, and container tools (e.g. Node, npm, pnpm, yarn, bun, deno, python, pip, uv, java, javac, go, rust, rustc, cargo, php, composer, ruby, gem, dotnet, gcc, g++, clang, cmake, pwsh, docker) on the local host environment.",
      inputSchema: toMcpSchema(EnvironmentDetectParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_environment_detect,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId, tools } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_environment_detect",
          projectId,
        });

        const runnerId = resolveRunner(context, projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.EnvironmentDetect,
          { projectId, tools }
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_environment_detect",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_environment_detect",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_project_detect
  server.registerTool(
    "localbridge_project_detect",
    {
      description:
        "Inspect an authorized project directory to automatically identify project ecosystem (Node, Rust, Go, Python, Java, PHP, Ruby, .NET, C/C++, Docker), installed runtimes, configuration files, and standard runnable package/build/test/dev scripts.",
      inputSchema: toMcpSchema(ProjectDetectParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_project_detect,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId, relativeCwd } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_project_detect",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProjectDetect,
          { projectId, relativeCwd }
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_project_detect",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_project_detect",
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

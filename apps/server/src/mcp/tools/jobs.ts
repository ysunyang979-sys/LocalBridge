import {
  BuildStartParamsSchema,
  JobCancelParamsSchema,
  JobListParamsSchema,
  JobLogsParamsSchema,
  JobStartToolInputSchema,
  JobStatusParamsSchema,
  RunnerRpcMethods,
  TestStartParamsSchema,
  sanitizeCommandSpec,
  type JobStartParams,
  type JobSummary,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerJobTools(server: McpServer, context: McpContext): void {
  // 17. localbridge_job_start
  server.registerTool(
    "localbridge_job_start",
    {
      description:
        "Start a long-running background command execution job within an authorized project and receive an asynchronous jobId.",
      inputSchema: toMcpSchema(JobStartToolInputSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_job_start,
    },
    async (args: any) => {
      const startTime = Date.now();
      const projectId = args.command?.projectId;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_job_start",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const sanitizedCommand = sanitizeCommandSpec(args.command);
        delete (sanitizedCommand as any).approvalId;
        const approvalId = args.approvalId || args.command?.approvalId;
        const rpcPayload: JobStartParams = {
          command: sanitizedCommand as any,
          timeoutMs: args.timeoutMs,
          approvalId: approvalId && approvalId.trim() !== "" ? approvalId : undefined,
        };

        const result = await context.request(
          runnerId,
          RunnerRpcMethods.JobStart,
          rpcPayload
        );

        // Record job -> runner mapping in memory
        context.trackJob(result.jobId, runnerId);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_job_start",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_job_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 18. localbridge_job_status
  server.registerTool(
    "localbridge_job_status",
    {
      description:
        "Check current execution state, risk, duration, exit code, and lifecycle timestamps for a background job.",
      inputSchema: toMcpSchema(JobStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_job_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { jobId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_job_status",
        });

        const runnerId = context.resolveJobRunner(jobId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.JobStatus,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_job_status",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_job_status",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 19. localbridge_job_logs
  server.registerTool(
    "localbridge_job_logs",
    {
      description:
        "Fetch paginated, sanitized stdout/stderr log chunks for a running or completed background job using opaque cursors.",
      inputSchema: toMcpSchema(JobLogsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_job_logs,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { jobId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_job_logs",
        });

        const runnerId = context.resolveJobRunner(jobId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.JobLogs,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_job_logs",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_job_logs",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 20. localbridge_job_cancel
  server.registerTool(
    "localbridge_job_cancel",
    {
      description:
        "Forcefully terminate an active background job and its entire subprocess tree.",
      inputSchema: toMcpSchema(JobCancelParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_job_cancel,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { jobId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_job_cancel",
        });

        const runnerId = context.resolveJobRunner(jobId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.JobCancel,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_job_cancel",
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_job_cancel",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 21. localbridge_job_list
  server.registerTool(
    "localbridge_job_list",
    {
      description:
        "List recent active and terminal background jobs with optional project or state filters.",
      inputSchema: toMcpSchema(JobListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_job_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_job_list",
          projectId: args.projectId,
        });

        if (args.projectId) {
          const runnerId = context.resolveProjectRunner(args.projectId);
          const result = await context.request(
            runnerId,
            RunnerRpcMethods.JobList,
            args
          );

          context.logAudit("mcp_tool_completed", {
            toolName: "localbridge_job_list",
            projectId: args.projectId,
            runnerId,
            durationMs: Date.now() - startTime,
            resultStatus: "success",
          });

          return formatToolSuccess(result);
        }

        // Query across all online runners
        const onlineRunners = context.runnerRegistry.list();
        const allJobs: JobSummary[] = [];

        for (const r of onlineRunners) {
          try {
            const res = await context.request(r.id, RunnerRpcMethods.JobList, args);
            allJobs.push(...res.jobs);
          } catch {
            // Ignore single runner query failure during broadcast
          }
        }

        // Sort descending by createdAt
        allJobs.sort((a, b) => b.createdAt - a.createdAt);
        const limit = args.limit ?? 50;
        const sliced = allJobs.slice(0, limit);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_job_list",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({ jobs: sliced });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_job_list",
          projectId: args.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 22. localbridge_build_start
  server.registerTool(
    "localbridge_build_start",
    {
      description:
        "Launch an authorized build package script (e.g. `npm run build` or `pnpm build`) as a background job.",
      inputSchema: toMcpSchema(BuildStartParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_build_start,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_build_start",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.BuildStart,
          args
        );

        // Record job -> runner mapping in memory
        context.trackJob(result.jobId, runnerId);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_build_start",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_build_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 23. localbridge_test_start
  server.registerTool(
    "localbridge_test_start",
    {
      description:
        "Launch an authorized test package script (e.g. `npm test` or `pnpm test`) as a background job.",
      inputSchema: toMcpSchema(TestStartParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_test_start,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_test_start",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.TestStart,
          args
        );

        // Record job -> runner mapping in memory
        context.trackJob(result.jobId, runnerId);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_test_start",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_test_start",
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

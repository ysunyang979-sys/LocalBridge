import {
  LayaMcpStatusParamsSchema,
  LayaMcpAssessParamsSchema,
  type LayaMcpStatusResult,
  type LayaMcpAssessResult,
  type DecisionContext,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerLayaTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_laya_status
  server.registerTool(
    "localbridge_laya_status",
    {
      description:
        "Query the current readiness, execution mode, and model loading status of the Nexus Laya Decision Intelligence engine.",
      inputSchema: toMcpSchema(LayaMcpStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_laya_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_laya_status",
        });

        const status = context.getIntelligenceStatus();
        const result: LayaMcpStatusResult = {
          enabled: status.status !== "disabled",
          provider: status.provider,
          workerReady: status.workerStatus === "running",
          modelLoaded: Boolean(status.modelLoaded),
          inferenceReady: Boolean(status.inferenceReady),
          modelPathConfigured: Boolean(status.modelPath),
          lastInferenceAt: status.lastInferenceAt || null,
          lastInferenceLatencyMs: status.lastInferenceLatencyMs ?? null,
        };

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_laya_status",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
          decisionSource: status.provider,
          clientName: "chatgpt",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_laya_status",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_laya_assess
  server.registerTool(
    "localbridge_laya_assess",
    {
      description:
        "Request an advisory risk and policy assessment from Laya Decision Intelligence before performing high-risk actions. Provides risk level, recommended action, confidence score, and optional skill suggestion.",
      inputSchema: toMcpSchema(LayaMcpAssessParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_laya_assess,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_laya_assess",
          projectId: args?.projectId,
        });

        const decisionContext: DecisionContext = {
          operation: args.operation,
          projectId: args.projectId,
          target: args.target,
          command: args.command,
          description: args.description,
          skillId: args.skillId,
          context: args.context,
          source: "chatgpt",
        };

        const advice = await context.getDecisionAdvice(decisionContext);

        const recommendation: "approve" | "review" | "deny" = advice.approval.recommended
          ? "approve"
          : advice.risk.label === "critical" || advice.risk.label === "high"
          ? "deny"
          : "review";

        const result: LayaMcpAssessResult = {
          risk: advice.risk.label,
          recommendation,
          confidence: advice.risk.confidence,
          category: advice.category || "general",
          reason: advice.reasoningTags.join(", ") || "Advisory assessment completed",
          providerUsed: advice.providerUsed || advice.provider || "laya",
          fallbackUsed: advice.fallbackUsed ?? true,
          workerReady: advice.workerReady ?? false,
          modelLoaded: advice.modelLoaded ?? false,
          inferenceExecuted: advice.inferenceExecuted ?? false,
          inferenceLatencyMs: advice.latencyMs,
          suggestedSkill: advice.routing?.suggestedSkill || "nexus.general",
        };

        context.decisionProvider.recordRecentInference?.({
          source: "chatgpt",
          operation: args.operation,
          target: args.target || args.command || undefined,
          risk: result.risk,
          recommendation: result.recommendation,
          confidence: result.confidence,
          providerUsed: result.providerUsed,
          fallbackUsed: result.fallbackUsed,
          inferenceExecuted: result.inferenceExecuted,
          latencyMs: result.inferenceLatencyMs ?? 0,
          timestamp: new Date().toISOString(),
        });

        if (args?.projectId) {
          context.recordSessionEvent({
            projectId: args.projectId,
            eventType: "LAYA_ADVISORY",
            source: "laya-decision-provider",
            summary: {
              operation: args.operation,
              risk: result.risk,
              recommendation: result.recommendation,
              confidence: result.confidence,
              providerUsed: result.providerUsed,
              fallbackUsed: result.fallbackUsed,
              inferenceExecuted: result.inferenceExecuted,
              suggestedSkill: result.suggestedSkill,
            },
          });
        }

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_laya_assess",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
          decisionSource: result.providerUsed,
          clientName: "chatgpt",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_laya_assess",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}

import {
  SkillListParamsSchema,
  SkillGetParamsSchema,
  SkillMatchParamsSchema,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerSkillTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_skill_list
  server.registerTool(
    "localbridge_skill_list",
    {
      description:
        "List all available and valid Nexus skills for ChatGPT, including built-in recipes, user workflows, and project-specific skills.",
      inputSchema: toMcpSchema(SkillListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_skill_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_skill_list",
          projectId: args?.projectId,
        });

        const skills = context.skillRegistry.listSkills({
          projectId: args?.projectId,
          enabledOnly: true,
        });

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_skill_list",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          count: skills.length,
          skills,
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_skill_list",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_skill_get
  server.registerTool(
    "localbridge_skill_get",
    {
      description:
        "Retrieve the complete declarative definition, step-by-step instructions (SKILL.md), and recommended MCP tools for a specific Nexus Skill.",
      inputSchema: toMcpSchema(SkillGetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_skill_get,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_skill_get",
          projectId: args?.projectId,
        });

        const skill = context.skillRegistry.getSkill(args.skillId, args?.projectId);
        if (!skill) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SKILL_NOT_FOUND,
            `Skill '${args.skillId}' was not found or is not accessible in project context '${args?.projectId || "global"}'`
          );
        }

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_skill_get",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
          clientName: "chatgpt",
        });

        return formatToolSuccess({
          skill,
          id: skill.id,
          name: typeof skill.name === "string" ? skill.name : (skill.name?.["zh-CN"] || skill.name?.["en-US"] || skill.id),
          type: skill.type || "nexus",
          source: skill.source,
          primaryDocument: skill.primaryDocument || "SKILL.md",
          content: skill.instructions,
          availableDocuments: skill.availableDocuments || (skill.primaryDocument ? [skill.primaryDocument] : ["SKILL.md"]),
          documents: skill.documents || skill.availableDocuments || [],
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_skill_get",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_skill_match
  server.registerTool(
    "localbridge_skill_match",
    {
      description:
        "Match a user request, prompt, or task description against available Nexus Skills to discover the most appropriate workflow and guidelines.",
      inputSchema: toMcpSchema(SkillMatchParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_skill_match,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_skill_match",
          projectId: args?.projectId,
        });

        let layaRec = args?.layaRecommendation;
        if (!layaRec && context.getIntelligenceStatus().status !== "disabled") {
          try {
            const advice = await context.getDecisionAdvice({
              operation: "skill_match",
              context: args.query,
              projectId: args?.projectId,
              source: "chatgpt",
            });
            layaRec = advice.routing?.suggestedSkill;
          } catch {
            // Advisory failure is non-blocking
          }
        }

        const match = context.skillRegistry.matchSkills(args.query, args?.projectId, layaRec);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_skill_match",
          projectId: args?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
          clientName: "chatgpt",
        });

        return formatToolSuccess(match);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_skill_match",
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

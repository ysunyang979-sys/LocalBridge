import fs from "node:fs";
import path from "node:path";
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
        "List all available and valid Nexus skills for ChatGPT, including built-in recipes, user workflows, raw collections, and project-specific skills.",
      inputSchema: toMcpSchema(SkillListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_skill_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_skill_list",
          projectId: args?.projectId,
          collectionId: args?.collectionId,
        });

        const enabledOnly = args?.enabledOnly !== undefined ? Boolean(args.enabledOnly) : true;
        const skills = context.skillRegistry.listSkills({
          projectId: args?.projectId,
          collectionId: args?.collectionId,
          source: args?.source,
          type: args?.type,
          enabledOnly,
        });

        // Format lightweight summaries (fast in-memory retrieval; never reads 100+ markdown files on disk)
        const skillSummaries = skills.map((s) => ({
          id: s.id,
          name: typeof s.name === "string" ? s.name : s.name?.["zh-CN"] || s.name?.["en-US"] || s.id,
          description:
            typeof s.description === "string"
              ? s.description
              : s.description?.["zh-CN"] || s.description?.["en-US"] || s.summary || "",
          type: s.type || "nexus",
          enabled: s.enabled,
          primaryDocument: s.primaryDocument || "SKILL.md",
          summary: s.summary,
          keywords: s.keywords,
          collectionId: s.collectionId,
          collectionName: s.collectionName,
        }));

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_skill_list",
          projectId: args?.projectId,
          collectionId: args?.collectionId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        if (args?.collectionId) {
          const coll = context.skillRegistry.getCollection(args.collectionId, args?.projectId);
          const collName =
            coll?.name ||
            skills[0]?.collectionName ||
            args.collectionId.replace(/^collection\./, "");

          return formatToolSuccess({
            collection: {
              id: args.collectionId,
              name: collName,
              totalSkills: coll?.skillsCount ?? skills.length,
              enabledSkills: coll?.enabledSkillsCount ?? skills.filter((s) => s.enabled).length,
            },
            count: skillSummaries.length,
            skills: skillSummaries,
          });
        }

        return formatToolSuccess({
          count: skillSummaries.length,
          skills: skillSummaries,
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
        "Retrieve the complete declarative definition, step-by-step instructions (SKILL.md), or referenced documentation files for a specific Nexus Skill.",
      inputSchema: toMcpSchema(SkillGetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_skill_get,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_skill_get",
          projectId: args?.projectId,
          skillId: args?.skillId,
          documentPath: args?.documentPath,
        });

        const skill = context.skillRegistry.getSkill(args.skillId, args?.projectId);
        if (!skill) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SKILL_NOT_FOUND,
            `Skill '${args.skillId}' was not found or is not accessible in project context '${args?.projectId || "global"}'`
          );
        }

        let docPath = skill.primaryDocument || "SKILL.md";
        let docContent = skill.instructions;

        if (args?.documentPath) {
          const resolvedBase = path.resolve(skill.sourcePath);
          const resolvedTarget = path.resolve(skill.sourcePath, args.documentPath);

          // Path containment check (prevent Zip-Slip / path traversal outside skill directory)
          if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.PATH_TRAVERSAL,
              `Document path '${args.documentPath}' escapes skill directory`
            );
          }

          if (!fs.existsSync(resolvedTarget) || fs.statSync(resolvedTarget).isDirectory()) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.FILE_NOT_FOUND,
              `Document '${args.documentPath}' was not found in skill '${args.skillId}'`
            );
          }

          docPath = args.documentPath;
          try {
            docContent = fs.readFileSync(resolvedTarget, "utf-8");
          } catch (err: any) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.INTERNAL_ERROR,
              `Failed to read document '${args.documentPath}': ${err?.message || String(err)}`
            );
          }
        }

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_skill_get",
          projectId: args?.projectId,
          skillId: args?.skillId,
          documentPath: docPath,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
          clientName: "chatgpt",
        });

        return formatToolSuccess({
          skill,
          id: skill.id,
          skillId: skill.id,
          name:
            typeof skill.name === "string"
              ? skill.name
              : skill.name?.["zh-CN"] || skill.name?.["en-US"] || skill.id,
          type: skill.type || "nexus",
          source: skill.source,
          collectionId: skill.collectionId,
          collectionName: skill.collectionName,
          enabled: skill.enabled,
          primaryDocument: skill.primaryDocument || "SKILL.md",
          documentPath: docPath,
          content: docContent,
          availableDocuments:
            skill.availableDocuments || (skill.primaryDocument ? [skill.primaryDocument] : ["SKILL.md"]),
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
          collectionId: args?.collectionId,
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

        const match = context.skillRegistry.matchSkills(
          args.query,
          args?.projectId,
          layaRec,
          args?.collectionId
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_skill_match",
          projectId: args?.projectId,
          collectionId: args?.collectionId,
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

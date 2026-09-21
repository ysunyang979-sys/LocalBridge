import type { FastifyPluginAsync } from "fastify";
import type { SkillSource } from "@localbridge/protocol";
import type { McpContext } from "../mcp/context.js";
import { checkLoopbackAndSecurity, type ManagementSecurityOptions } from "./management.js";

export interface SkillsRouteOptions extends ManagementSecurityOptions {
  mcpContext: McpContext;
}

export const skillsRoutes: FastifyPluginAsync<SkillsRouteOptions> = async (
  fastify,
  opts
) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (!checkLoopbackAndSecurity(request, reply, opts)) return reply;
  });

  const { mcpContext } = opts;

  // GET /api/skills - List skills
  fastify.get<{
    Querystring: {
      projectId?: string;
      category?: string;
      source?: SkillSource;
      enabledOnly?: string | boolean;
    };
  }>("/skills", async (request, reply) => {
    const { projectId, category, source, enabledOnly } = request.query;
    const isEnabledOnly = enabledOnly === "true" || enabledOnly === true;

    const skills = mcpContext.skillRegistry.listSkills({
      projectId,
      category,
      source,
      enabledOnly: isEnabledOnly,
    });

    return reply.status(200).send({
      count: skills.length,
      skills,
    });
  });

  // GET /api/skills/:id - Get skill details
  fastify.get<{
    Params: { id: string };
    Querystring: { projectId?: string };
  }>("/skills/:id", async (request, reply) => {
    const { id } = request.params;
    const { projectId } = request.query;

    const skill = mcpContext.skillRegistry.getSkill(id, projectId);
    if (!skill) {
      return reply.status(404).send({
        code: "SKILL_NOT_FOUND",
        message: `Skill "${id}" not found or not accessible`,
      });
    }

    return reply.status(200).send(skill);
  });

  // POST /api/skills/reload - Hot-reload skills from disk
  fastify.post<{
    Body?: {
      projectDirs?: Array<{ projectId: string; rootPath: string }>;
    };
  }>("/skills/reload", async (request, reply) => {
    const projectDirs = request.body?.projectDirs ?? [];
    mcpContext.skillRegistry.reload(projectDirs);

    const skills = mcpContext.skillRegistry.listSkills();
    return reply.status(200).send({
      reloaded: true,
      count: skills.length,
      skills,
    });
  });

  // PATCH /api/skills/:id/toggle - Enable or disable a skill
  fastify.patch<{
    Params: { id: string };
    Body: { enabled: boolean };
  }>("/skills/:id/toggle", async (request, reply) => {
    const { id } = request.params;
    const { enabled } = request.body || {};

    if (typeof enabled !== "boolean") {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "Field 'enabled' (boolean) is required in request body",
      });
    }

    const success = mcpContext.skillRegistry.toggleSkill(id, enabled);
    if (!success) {
      return reply.status(400).send({
        code: "TOGGLE_FAILED",
        message: `Could not toggle skill "${id}". The skill might not exist or may have validation/conflict errors.`,
      });
    }

    const updated = mcpContext.skillRegistry.getSkill(id);
    return reply.status(200).send({
      success: true,
      skill: updated,
    });
  });

  // POST /api/skills/match - Test match a query against skills
  fastify.post<{
    Body: { query: string; projectId?: string };
  }>("/skills/match", async (request, reply) => {
    const { query, projectId } = request.body || {};
    if (!query) {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "Field 'query' (string) is required in request body",
      });
    }

    const result = mcpContext.skillRegistry.matchSkills(query, projectId);
    return reply.status(200).send(result);
  });
};

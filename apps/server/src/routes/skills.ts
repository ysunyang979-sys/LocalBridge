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

  // POST /api/skills/preview - Preview skill before importing
  fastify.post<{
    Body: {
      sourceType: "folder" | "zip";
      sourcePath?: string;
      zipBase64?: string;
      target?: "user" | "project";
      projectId?: string;
      subPath?: string;
    };
  }>("/skills/preview", async (request, reply) => {
    const { sourceType, sourcePath, zipBase64, target = "user", projectId, subPath } =
      request.body || {};

    if (!sourceType || (sourceType !== "folder" && sourceType !== "zip")) {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "Field 'sourceType' must be 'folder' or 'zip'",
      });
    }

    try {
      if (sourceType === "folder") {
        if (!sourcePath) {
          return reply.status(400).send({
            code: "INVALID_ARGUMENT",
            message: "Field 'sourcePath' is required when sourceType is 'folder'",
          });
        }
        const preview = await mcpContext.skillImporter.previewFolder(
          sourcePath,
          target,
          projectId,
          subPath
        );
        return reply.status(200).send(preview);
      } else {
        let zipInput: Buffer | string;
        if (zipBase64) {
          zipInput = Buffer.from(zipBase64, "base64");
        } else if (sourcePath) {
          zipInput = sourcePath;
        } else {
          return reply.status(400).send({
            code: "INVALID_ARGUMENT",
            message: "Either 'sourcePath' or 'zipBase64' is required for ZIP preview",
          });
        }
        const preview = await mcpContext.skillImporter.previewZip(
          zipInput,
          target,
          projectId,
          subPath
        );
        return reply.status(200).send(preview);
      }
    } catch (err: any) {
      return reply.status(500).send({
        code: "PREVIEW_ERROR",
        message: err.message || String(err),
      });
    }
  });

  // POST /api/skills/import - Import skill from folder or zip
  fastify.post<{
    Body: {
      sourceType: "folder" | "zip";
      sourcePath?: string;
      zipBase64?: string;
      target: "user" | "project";
      projectId?: string;
      projectRoot?: string;
      overwrite?: boolean;
      customYaml?: string;
      subPath?: string;
    };
  }>("/skills/import", async (request, reply) => {
    const {
      sourceType,
      sourcePath,
      zipBase64,
      target = "user",
      projectId,
      projectRoot,
      overwrite,
      customYaml,
      subPath,
    } = request.body || {};

    if (!sourceType || (sourceType !== "folder" && sourceType !== "zip")) {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "Field 'sourceType' must be 'folder' or 'zip'",
      });
    }

    if (target === "project" && !projectRoot) {
      return reply.status(400).send({
        code: "INVALID_ARGUMENT",
        message: "Field 'projectRoot' is required for project-scoped skill import",
      });
    }

function sanitizeSecretStrings<T>(input: T): T {
  if (typeof input === "string") {
    return input
      .replace(/lm_[a-zA-Z0-9_\-]+/g, "lm_***")
      .replace(/lb_[a-zA-Z0-9_\-]+/g, "lb_***")
      .replace(/(token|secret|password|bearer)\s*[:=]\s*["']?[a-zA-Z0-9_\-\.]+["']?/gi, "$1=***") as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeSecretStrings) as unknown as T;
  }
  if (input && typeof input === "object") {
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (/token|secret|password/i.test(k) && typeof v === "string") {
        copy[k] = "***";
      } else {
        copy[k] = sanitizeSecretStrings(v);
      }
    }
    return copy as T;
  }
  return input;
}

    try {
      if (sourceType === "folder") {
        if (!sourcePath) {
          return reply.status(400).send({
            code: "INVALID_ARGUMENT",
            message: "Field 'sourcePath' is required when sourceType is 'folder'",
          });
        }
        const result = await mcpContext.skillImporter.importFolder({
          sourcePath,
          target,
          projectId,
          projectRoot,
          overwrite,
          customYaml,
          subPath,
        });

        const sanitized = sanitizeSecretStrings(result);
        if (!sanitized.success) {
          return reply.status(400).send(sanitized);
        }
        return reply.status(200).send(sanitized);
      } else {
        let zipInput: Buffer | string;
        if (zipBase64) {
          zipInput = Buffer.from(zipBase64, "base64");
        } else if (sourcePath) {
          zipInput = sourcePath;
        } else {
          return reply.status(400).send({
            code: "INVALID_ARGUMENT",
            message: "Either 'sourcePath' or 'zipBase64' is required for ZIP import",
          });
        }
        const result = await mcpContext.skillImporter.importZip({
          zipBufferOrPath: zipInput,
          target,
          projectId,
          projectRoot,
          overwrite,
          customYaml,
          subPath,
        });

        const sanitized = sanitizeSecretStrings(result);
        if (!sanitized.success) {
          return reply.status(400).send(sanitized);
        }
        return reply.status(200).send(sanitized);
      }
    } catch (err: any) {
      const sanitizedMsg = sanitizeSecretStrings(err.message || String(err));
      return reply.status(500).send({
        success: false,
        code: "UNEXPECTED_SERVER_ERROR",
        stage: "filesystem_commit",
        error: sanitizedMsg,
        message: sanitizedMsg,
      });
    }
  });

  // DELETE /api/skills/:id - Delete a user or project skill
  fastify.delete<{
    Params: { id: string };
    Querystring: { target?: "user" | "project"; projectId?: string; projectRoot?: string };
  }>("/skills/:id", async (request, reply) => {
    const { id } = request.params;
    const { target, projectId, projectRoot } = request.query;

    const result = await mcpContext.skillImporter.deleteSkill({
      skillId: id,
      target,
      projectId,
      projectRoot,
    });

    if (!result.success) {
      return reply.status(400).send(result);
    }
    return reply.status(200).send(result);
  });

  // GET /api/skills/:id/raw - Get raw skill.yaml and SKILL.md content
  fastify.get<{
    Params: { id: string };
    Querystring: { projectId?: string };
  }>("/skills/:id/raw", async (request, reply) => {
    const { id } = request.params;
    const { projectId } = request.query;

    try {
      const raw = mcpContext.skillImporter.getRawContent(id, projectId);
      return reply.status(200).send(raw);
    } catch (err: any) {
      return reply.status(404).send({
        code: "SKILL_NOT_FOUND",
        message: err.message || `Skill "${id}" not found`,
      });
    }
  });
};

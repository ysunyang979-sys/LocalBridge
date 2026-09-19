import type { FastifyPluginAsync } from "fastify";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import type { ServerProjectService } from "../runner/project-service.js";
import { checkLoopbackAndSecurity, type ManagementSecurityOptions } from "./management.js";

export interface ProjectsRouteOptions extends ManagementSecurityOptions {
  projectService: ServerProjectService;
}

export const projectsRoutes: FastifyPluginAsync<ProjectsRouteOptions> = async (
  fastify,
  opts
) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (!checkLoopbackAndSecurity(request, reply, opts)) return reply;
  });
  const { projectService } = opts;

  // GET /api/projects - List public projects
  fastify.get("/projects", async (_request, reply) => {
    const projects = projectService.listProjects();
    return reply.status(200).send({ projects });
  });

  // GET /api/projects/:id - Get public project details
  fastify.get<{ Params: { id: string } }>(
    "/projects/:id",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);

      if (!project) {
        return reply.status(404).send({
          code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          message: `Project "${id}" not found`,
        });
      }

      return reply.status(200).send(project);
    }
  );

  // Explicit rejection of remote path authorization attempts
  fastify.post("/projects", async (_request, reply) => {
    return reply.status(405).send({
      code: "METHOD_NOT_ALLOWED",
      message: "Remote clients and server cannot authorize local paths. Use local runner CLI to authorize projects.",
    });
  });

  fastify.put("/projects/:id/path", async (_request, reply) => {
    return reply.status(405).send({
      code: "METHOD_NOT_ALLOWED",
      message: "Project physical roots cannot be modified remotely.",
    });
  });
};

import type { FastifyPluginAsync } from "fastify";
import type { RunnerRegistry } from "../runner/registry.js";

export interface RunnersRouteOptions {
  runnerRegistry: RunnerRegistry;
}

export const runnersRoutes: FastifyPluginAsync<RunnersRouteOptions> = async (
  fastify,
  options
) => {
  const { runnerRegistry } = options;

  fastify.get("/runners", async (_request, reply) => {
    const list = runnerRegistry.list();
    return reply.status(200).send(list);
  });
};

import type { FastifyPluginAsync } from "fastify";
import { RunnerRpcMethods } from "@localbridge/protocol";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";

export interface RunnersRouteOptions {
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
}

export const runnersRoutes: FastifyPluginAsync<RunnersRouteOptions> = async (
  fastify,
  options
) => {
  const { runnerRegistry, rpcService } = options;

  fastify.get("/runners", async (_request, reply) => {
    const list = runnerRegistry.list();
    return reply.status(200).send(list);
  });

  // Management Debug API: Ping a connected runner
  fastify.post<{ Params: { id: string } }>(
    "/runners/:id/ping",
    async (request, reply) => {
      const { id } = request.params;
      const result = await rpcService.request(id, RunnerRpcMethods.SystemPing, {});
      return reply.status(200).send(result);
    }
  );

  // Management Debug API: Query real-time system-info from a connected runner
  fastify.get<{ Params: { id: string } }>(
    "/runners/:id/system-info",
    async (request, reply) => {
      const { id } = request.params;
      const result = await rpcService.request(id, RunnerRpcMethods.SystemInfo, {});
      return reply.status(200).send(result);
    }
  );
};

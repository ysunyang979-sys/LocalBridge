import type { FastifyPluginAsync } from "fastify";
import { checkLoopbackAndSecurity, type ManagementSecurityOptions } from "./management.js";

export interface StatusRouteOptions extends ManagementSecurityOptions {
  version?: string;
  getRunnersConnected?: () => number;
  isMcpActive?: () => boolean;
}

export const statusRoutes: FastifyPluginAsync<StatusRouteOptions> = async (
  fastify,
  options
) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (!checkLoopbackAndSecurity(request, reply, options)) return reply;
  });
  const version = options?.version ?? "0.1.0";
  const getRunnersConnected = options?.getRunnersConnected ?? (() => 0);
  const isMcpActive = options?.isMcpActive ?? (() => false);

  fastify.get("/status", async (_request, reply) => {
    return reply.status(200).send({
      server: "LocalBridge Server",
      version,
      runners_connected: getRunnersConnected(),
      mcp_active: isMcpActive(),
    });
  });
};

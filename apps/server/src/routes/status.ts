import type { FastifyPluginAsync } from "fastify";

export interface StatusRouteOptions {
  version?: string;
  getRunnersConnected?: () => number;
  isMcpActive?: () => boolean;
}

export const statusRoutes: FastifyPluginAsync<StatusRouteOptions> = async (
  fastify,
  options
) => {
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

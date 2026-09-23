import type http from "node:http";
import { NexusClient } from "./nexus-client.js";
import { createGatewayHttpServer, type McpGatewayOptions } from "./gateway-server.js";

export { McpGatewayOptions } from "./gateway-server.js";

export interface McpGatewayInstance {
  server: http.Server;
  host: string;
  port: number;
  stop: () => Promise<void>;
}

let activeGatewayInstance: McpGatewayInstance | null = null;

/**
 * Starts the Integrated MCP Gateway listener on 127.0.0.1:8787.
 */
export async function startMcpGateway(
  options: McpGatewayOptions = {}
): Promise<McpGatewayInstance> {
  const host = options.host || process.env.NEXUS_BRIDGE_HOST || "127.0.0.1";
  const port = options.port || parseInt(process.env.NEXUS_BRIDGE_PORT || "8787", 10);
  const logger = options.logger;

  const nexusClient = new NexusClient({
    coreUrl: options.coreUrl || "http://127.0.0.1:18080",
    projectService: options.projectService,
    tokenService: options.tokenService,
  });

  const server = createGatewayHttpServer(options, nexusClient);

  return new Promise<McpGatewayInstance>((resolve, reject) => {
    server.once("error", (err: any) => {
      if (logger) {
        logger.warn({ err }, `[MCP Gateway] Failed to listen on ${host}:${port}`);
      }
      reject(err);
    });

    server.listen(port, host, () => {
      if (logger) {
        logger.info(
          `[MCP Gateway] Integrated Standard MCP Gateway listening at http://${host}:${port}/mcp`
        );
      }

      const instance: McpGatewayInstance = {
        server,
        host,
        port,
        stop: async () => {
          return new Promise<void>((res) => {
            server.close(() => {
              if (logger) {
                logger.info(`[MCP Gateway] Stopped listening on ${host}:${port}`);
              }
              res();
            });
          });
        },
      };

      activeGatewayInstance = instance;
      resolve(instance);
    });
  });
}

/**
 * Stops the currently running MCP Gateway instance if active.
 */
export async function stopMcpGateway(): Promise<void> {
  if (activeGatewayInstance) {
    const inst = activeGatewayInstance;
    activeGatewayInstance = null;
    await inst.stop();
  }
}

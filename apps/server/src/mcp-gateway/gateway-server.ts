import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { NexusClient } from "./nexus-client.js";
import { registerProjectTools } from "./tools/project.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerGitTools } from "./tools/git.js";
import { registerRuntimeTools } from "./tools/runtime.js";
import { validateBearerToken } from "./security.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { TokenService } from "../db/token-service.js";

export interface McpGatewayOptions {
  host?: string;
  port?: number;
  coreUrl?: string;
  bridgeToken?: string;
  projectService?: ServerProjectService;
  tokenService?: TokenService;
  logger?: any;
}

/**
 * Creates an official standard MCP Server containing strictly the 8 whitelisted Nexus tools.
 */
export function createGatewayMcpServer(nexusClient: NexusClient): McpServer {
  const server = new McpServer({
    name: "nexus-mcp-gateway",
    version: "1.0.0",
  });

  registerProjectTools(server, nexusClient);
  registerFilesystemTools(server, nexusClient);
  registerGitTools(server, nexusClient);
  registerRuntimeTools(server, nexusClient);

  return server;
}

/**
 * Handles incoming Streamable HTTP MCP requests using official MCP SDK transport.
 */
export async function handleGatewayMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: any,
  nexusClient: NexusClient
): Promise<void> {
  const currentAccept = req.headers.accept || "";
  if (
    !currentAccept ||
    currentAccept === "*/*" ||
    !currentAccept.includes("text/event-stream") ||
    !currentAccept.includes("application/json")
  ) {
    req.headers.accept = "application/json, text/event-stream";
  }

  if (!req.headers["mcp-protocol-version"]) {
    req.headers["mcp-protocol-version"] = "2024-11-05";
  }

  const mcpServer = createGatewayMcpServer(nexusClient);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const cleanup = () => {
    try {
      transport.close();
      mcpServer.close();
    } catch {}
  };

  res.on("finish", cleanup);
  res.on("close", cleanup);

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Creates the full HTTP Server instance for the MCP Gateway on 127.0.0.1:8787.
 */
export function createGatewayHttpServer(
  options: McpGatewayOptions,
  nexusClient: NexusClient
): http.Server {
  const logger = options.logger;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // CORS Headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id"
    );

    // 1. OPTIONS Preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 2. GET /health
    if (req.method === "GET" && (pathname === "/health" || pathname === "/api/health")) {
      const nexusHealth = await nexusClient.checkHealth();
      let projectsCount = 0;
      if (nexusHealth.ok) {
        try {
          const projects = await nexusClient.getProjects();
          projectsCount = projects.length;
        } catch {}
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            ok: true,
            service: "nexus-mcp-gateway",
            version: "1.0.0",
            nexus: {
              connected: nexusHealth.ok,
              url: options.coreUrl || "http://127.0.0.1:18080",
              projectsCount,
              error: nexusHealth.error,
            },
            protocol: {
              target: "Standard MCP (2024-11-05 Streamable HTTP)",
              supportedClients: ["Gemini Spark", "Claude", "Cursor", "Antigravity"],
            },
            uptime: process.uptime(),
          },
          null,
          2
        )
      );
      return;
    }

    // 3. POST /mcp (Standard MCP Entrypoint)
    if (pathname === "/mcp") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method Not Allowed. Use POST for MCP endpoint." }));
        return;
      }

      // Security Bearer Token Check
      const auth = validateBearerToken(
        req.headers.authorization,
        options.tokenService,
        options.bridgeToken
      );

      if (!auth.valid) {
        const clientIp = req.socket.remoteAddress || "unknown";
        if (logger) {
          logger.warn(
            { ip: clientIp, error: auth.error },
            "[MCP Gateway] 401 Unauthorized access attempt blocked"
          );
        }
        res.writeHead(auth.statusCode || 401, {
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer realm="nexus-mcp-gateway"',
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: auth.error || "Unauthorized",
            },
          })
        );
        return;
      }

      // Read Request Body
      let rawBody = "";
      req.on("data", (chunk) => {
        rawBody += chunk;
        if (rawBody.length > 10 * 1024 * 1024) {
          req.destroy();
        }
      });

      req.on("end", async () => {
        try {
          const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : undefined;
          await handleGatewayMcpRequest(req, res, parsedBody, nexusClient);
        } catch (err: any) {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message: `Internal gateway error: ${err.message}`,
                },
              })
            );
          }
        }
      });
      return;
    }

    // 4. Fallback 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Not Found",
        message: "Nexus Integrated MCP Gateway. Use POST /mcp or GET /health.",
      })
    );
  });
}

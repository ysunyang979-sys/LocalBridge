import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { TokenService } from "../db/token-service.js";
import { McpContext } from "./context.js";
import { createLocalBridgeMcpServer } from "./server.js";
import { McpRateLimiter } from "./rate-limiter.js";
import {
  MAX_MCP_BODY_BYTES,
  MCP_PROTOCOL_VERSION,
  type McpPrincipal,
} from "./types.js";

export interface McpRoutesOptions {
  tokenService: TokenService;
  mcpContext: McpContext;
  rateLimiter?: McpRateLimiter;
  allowedHosts?: string[];
}

export const mcpRoutes: FastifyPluginAsync<McpRoutesOptions> = async (
  fastify,
  options
) => {
  const { tokenService, mcpContext } = options;
  const rateLimiter = options.rateLimiter ?? new McpRateLimiter();
  const allowedHosts = options.allowedHosts ?? [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "::1",
  ];

  // Helper to validate Host header for DNS rebinding protection
  function isHostAllowed(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    // Strip port if present
    const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
    return allowedHosts.some(
      (h) => h.toLowerCase() === hostname || hostname === `[${h.toLowerCase()}]`
    );
  }

  // 1. Loopback-only MCP Status Endpoint
  fastify.get("/api/mcp/status", async (request: FastifyRequest, reply: FastifyReply) => {
    const clientIp = request.ip;
    const isLoopback =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1" ||
      clientIp === "localhost";

    if (!isLoopback) {
      return reply.status(403).send({
        error: "Forbidden: Management API is only accessible via loopback",
        code: "LOOPBACK_ONLY",
      });
    }

    return reply.status(200).send({
      mcpActive: !mcpContext.isPaused(),
      paused: mcpContext.isPaused(),
      version: "0.11.0",
      protocolVersion: MCP_PROTOCOL_VERSION,
      toolsCount: 23,
    });
  });

  // 2. Reject non-POST HTTP methods on /mcp
  fastify.route({
    method: ["GET", "DELETE", "PUT", "PATCH"],
    url: "/mcp",
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(405).send({
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: "Method Not Allowed: MCP endpoint requires HTTP POST",
        },
        id: null,
      });
    },
  });

  // 3. MCP 2026-07-28 POST Endpoint
  fastify.post(
    "/mcp",
    {
      bodyLimit: MAX_MCP_BODY_BYTES,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 3.0 Global Pause Check
      if (mcpContext.isPaused()) {
        const bodyId =
          typeof request.body === "object" &&
          request.body !== null &&
          !Array.isArray(request.body)
            ? (request.body as Record<string, any>).id ?? null
            : null;
        return reply.status(503).send({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "LocalBridge AI access is paused by local user",
          },
          id: bodyId,
        });
      }

      // 3.1 DNS Rebinding Protection: Host Header Validation
      const host = request.headers.host;
      if (!isHostAllowed(host)) {
        return reply.status(403).send({
          error: "Forbidden: Host header validation failed",
          code: "HOST_NOT_ALLOWED",
        });
      }

      // 3.2 Request Body Size Check
      const contentLengthHeader = request.headers["content-length"];
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (contentLength > MAX_MCP_BODY_BYTES) {
          return reply.status(413).send({
            error: `Payload Too Large: Request exceeds limit of ${MAX_MCP_BODY_BYTES} bytes`,
            code: "MCP_BODY_TOO_LARGE",
          });
        }
      }

      // 3.3 Protocol Version Header Check (if present, must match 2026-07-28)
      const protocolVersionHeader = request.headers["mcp-protocol-version"];
      if (
        protocolVersionHeader &&
        protocolVersionHeader !== MCP_PROTOCOL_VERSION
      ) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: `Unsupported MCP protocol version: expected ${MCP_PROTOCOL_VERSION}, got ${protocolVersionHeader}`,
          },
          id: null,
        });
      }

      const body =
        typeof request.body === "object" &&
        request.body !== null &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, any>)
          : undefined;

      // Ensure modern 2026-07-28 envelope metadata exists on body params so wire codec resolves request
      if (body) {
        if (!body.params || typeof body.params !== "object") {
          body.params = {};
        }
        if (!body.params._meta) {
          body.params._meta = {
            "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientCapabilities": {},
          };
        }
      }

      // 3.4 Mcp-Method Header Check (if present, must match JSON-RPC method)
      const mcpMethodHeader = request.headers["mcp-method"];
      if (
        mcpMethodHeader &&
        body?.method &&
        mcpMethodHeader !== body.method
      ) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: `Header Mcp-Method "${mcpMethodHeader}" does not match request body method "${body.method}"`,
          },
          id: body?.id ?? null,
        });
      }

      // 3.5 Mcp-Name Header Check for tools/call (if present, must match params.name)
      const mcpNameHeader = request.headers["mcp-name"];
      if (
        mcpNameHeader &&
        body?.method === "tools/call" &&
        body?.params?.name &&
        mcpNameHeader !== body.params.name
      ) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: `Header Mcp-Name "${mcpNameHeader}" does not match tool name "${body.params.name}"`,
          },
          id: body?.id ?? null,
        });
      }

      // 3.6 Bearer Token Authentication & Cross-Token Isolation
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({
          error: "Unauthorized: Missing Bearer token in Authorization header",
          code: "MISSING_TOKEN",
        });
      }

      const rawToken = authHeader.slice(7).trim();
      const validation = tokenService.validateMcpToken(rawToken);
      if (!validation.valid) {
        let code = "TOKEN_NOT_FOUND";
        if (validation.reason === "INVALID_TOKEN_TYPE") {
          code = "INVALID_TOKEN_TYPE";
        } else if (validation.reason === "TOKEN_REVOKED") {
          code = "TOKEN_REVOKED";
        } else if (validation.reason === "TOKEN_EXPIRED") {
          code = "TOKEN_EXPIRED";
        }
        return reply.status(401).send({
          error: `Unauthorized: ${validation.reason ?? "Invalid token"}`,
          code,
        });
      }

      const tokenRecord = validation.tokenRecord!;
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(tokenRecord.scopes || "[]");
      } catch {
        scopes = [];
      }

      const principal: McpPrincipal = {
        id: tokenRecord.id,
        authType: "localbridge-token",
        scopes,
        tokenId: tokenRecord.id,
      };

      // 3.7 Rate Limiting & Concurrency Tracking
      const rateLimitResult = rateLimiter.acquire(principal.id);
      if (!rateLimitResult.allowed) {
        return reply.status(429).send({
          error: `Too Many Requests: ${rateLimitResult.reason}`,
          code: "MCP_RATE_LIMITED",
          reason: rateLimitResult.reason,
        });
      }

      // 3.8 Ensure Accept Header accommodates both application/json and text/event-stream
      const currentAccept = request.raw.headers.accept ?? "";
      if (
        !currentAccept.includes("text/event-stream") ||
        !currentAccept.includes("application/json")
      ) {
        request.raw.headers.accept = currentAccept
          ? `${currentAccept}, text/event-stream, application/json`
          : "application/json, text/event-stream";
      }

      // 3.9 Create fresh stateless McpServer and Transport for this request
      const server = createLocalBridgeMcpServer(mcpContext);
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
      });

      let released = false;
      const releaseSlot = () => {
        if (!released) {
          released = true;
          rateLimiter.release(principal.id);
        }
      };

      let cleanedUp = false;
      const cleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true;
          releaseSlot();
          transport.close().catch(() => {});
          server.close().catch(() => {});
        }
      };

      reply.raw.on("finish", cleanup);
      reply.raw.on("close", cleanup);

      try {
        reply.hijack();
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch (err) {
        cleanup();
        throw err;
      }
    }
  );
};

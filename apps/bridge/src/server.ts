import type http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { NexusClient } from "./nexus-client.js";
import { registerProjectTools } from "./tools/project.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerGitTools } from "./tools/git.js";
import { registerRuntimeTools } from "./tools/runtime.js";

/**
 * Creates and registers all whitelisted Nexus tools into an official MCP Server instance.
 */
export function createMcpServer(nexusClient: NexusClient): McpServer {
  const server = new McpServer({
    name: "nexus-mcp-bridge",
    version: "1.0.0",
  });

  // Register strictly whitelisted Nexus tools:
  registerProjectTools(server, nexusClient);
  registerFilesystemTools(server, nexusClient);
  registerGitTools(server, nexusClient);
  registerRuntimeTools(server, nexusClient);

  return server;
}

/**
 * Dispatches an incoming HTTP request to a stateless MCP Server & Streamable HTTP transport.
 */
export async function handleMcpHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: any,
  nexusClient: NexusClient
): Promise<void> {
  // Normalize Accept header to accommodate standard MCP clients (Gemini, Claude, curl, etc.)
  const currentAccept = req.headers.accept || "";
  if (
    !currentAccept ||
    currentAccept === "*/*" ||
    !currentAccept.includes("text/event-stream") ||
    !currentAccept.includes("application/json")
  ) {
    req.headers.accept = "application/json, text/event-stream";
  }

  // Provide default standard protocol version if missing
  if (!req.headers["mcp-protocol-version"]) {
    req.headers["mcp-protocol-version"] = "2024-11-05";
  }

  // Create fresh stateless McpServer and Transport
  const mcpServer = createMcpServer(nexusClient);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const cleanup = () => {
    try {
      transport.close().catch(() => {});
      mcpServer.close().catch(() => {});
    } catch {}
  };

  res.on("finish", cleanup);
  res.on("close", cleanup);

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

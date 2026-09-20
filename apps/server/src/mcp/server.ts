import { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "./context.js";
import { MCP_PROTOCOL_VERSION } from "./types.js";
import { registerProjectTools } from "./tools/project.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerGitTools } from "./tools/git.js";
import { registerCommandTools } from "./tools/command.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerApprovalTools } from "./tools/approvals.js";
import { registerCodeTools } from "./tools/code.js";
import { registerSessionTools } from "./tools/session.js";
import { registerWorktreeTools } from "./tools/worktree.js";
import { registerRuntimeTools } from "./tools/runtime.js";

export interface McpServerOptions {
  name?: string;
  version?: string;
}

export function createLocalBridgeMcpServer(
  context: McpContext,
  options: McpServerOptions = {}
): McpServer {
  const server = new McpServer(
    {
      name: options.name ?? "localbridge-server",
      version: options.version ?? "0.10.0",
    },
    {
      supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
    }
  );

  // Set negotiated protocol version to 2026-07-28 so the wire codec resolves server/discover and other 2026-era methods
  (server.server as any)._negotiatedProtocolVersion = MCP_PROTOCOL_VERSION;

  // Register all tools (projects, filesystem, git, command, jobs, approvals, code, session, worktree, runtime)
  registerProjectTools(server, context);
  registerFilesystemTools(server, context);
  registerGitTools(server, context);
  registerCommandTools(server, context);
  registerJobTools(server, context);
  registerApprovalTools(server, context);
  registerCodeTools(server, context);
  registerSessionTools(server, context);
  registerWorktreeTools(server, context);
  registerRuntimeTools(server, context);

  return server;
}

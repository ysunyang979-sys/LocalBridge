import { MCP_TOOL_SCOPE, requiredScopeForTool } from "../apps/server/src/mcp/scope-policy.js";
import { registerProjectTools } from "../apps/server/src/mcp/tools/project.js";
import { registerFilesystemTools } from "../apps/server/src/mcp/tools/filesystem.js";
import { registerGitTools } from "../apps/server/src/mcp/tools/git.js";
import { registerCommandTools } from "../apps/server/src/mcp/tools/command.js";
import { registerJobTools } from "../apps/server/src/mcp/tools/jobs.js";
import { registerApprovalTools } from "../apps/server/src/mcp/tools/approvals.js";
import { registerCodeTools } from "../apps/server/src/mcp/tools/code.js";
import { registerSessionTools } from "../apps/server/src/mcp/tools/session.js";
import { registerWorktreeTools } from "../apps/server/src/mcp/tools/worktree.js";
import { registerRuntimeTools } from "../apps/server/src/mcp/tools/runtime.js";

const toolNames: string[] = [];
const mockServer: any = {
  registerTool: (name: string) => {
    toolNames.push(name);
  },
};
const mockContext: any = {};

registerProjectTools(mockServer, mockContext);
registerFilesystemTools(mockServer, mockContext);
registerGitTools(mockServer, mockContext);
registerCommandTools(mockServer, mockContext);
registerJobTools(mockServer, mockContext);
registerApprovalTools(mockServer, mockContext);
registerCodeTools(mockServer, mockContext);
registerSessionTools(mockServer, mockContext);
registerWorktreeTools(mockServer, mockContext);
registerRuntimeTools(mockServer, mockContext);

const totalTools = toolNames.length;
const mappedTools: string[] = [];
const unmappedTools: string[] = [];

for (const name of toolNames) {
  const scope = requiredScopeForTool(name);
  if (scope) {
    mappedTools.push(name);
  } else {
    unmappedTools.push(name);
  }
}

const scopeKeys = Object.keys(MCP_TOOL_SCOPE);
const extraInScope = scopeKeys.filter((k) => !toolNames.includes(k));

console.log(JSON.stringify({
  totalTools,
  mappedCount: mappedTools.length,
  unmappedCount: unmappedTools.length,
  unmappedTools,
  extraInScope,
  allTools: toolNames.sort(),
}, null, 2));

process.exit(0);

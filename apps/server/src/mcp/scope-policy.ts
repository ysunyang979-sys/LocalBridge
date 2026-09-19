export type McpScope = "read" | "write" | "execute";

export const MCP_TOOL_SCOPE: Readonly<Record<string, McpScope>> = Object.freeze({
  localbridge_project_list: "read",
  localbridge_project_info: "read",
  localbridge_directory_list: "read",
  localbridge_file_stat: "read",
  localbridge_file_read: "read",
  localbridge_git_info: "read",
  localbridge_git_status: "read",
  localbridge_git_diff: "read",
  localbridge_git_log: "read",
  localbridge_command_classify: "read",
  localbridge_job_status: "read",
  localbridge_job_logs: "read",
  localbridge_job_list: "read",
  localbridge_file_create: "write",
  localbridge_file_write: "write",
  localbridge_file_patch: "write",
  localbridge_file_delete: "write",
  localbridge_file_restore: "write",
  localbridge_command_run: "execute",
  localbridge_job_start: "execute",
  localbridge_job_cancel: "execute",
  localbridge_build_start: "execute",
  localbridge_test_start: "execute",
});

export function requiredScopeForTool(toolName: string): McpScope | undefined {
  return MCP_TOOL_SCOPE[toolName];
}

export function hasToolScope(scopes: readonly string[], toolName: string): boolean {
  const required = requiredScopeForTool(toolName);
  return required !== undefined && scopes.includes(required);
}

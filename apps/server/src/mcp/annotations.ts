import type { ToolAnnotations } from "./types.js";

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // Read-only tools
  localbridge_project_list: { readOnlyHint: true },
  localbridge_project_info: { readOnlyHint: true },
  localbridge_directory_list: { readOnlyHint: true },
  localbridge_file_stat: { readOnlyHint: true },
  localbridge_file_read: { readOnlyHint: true },
  localbridge_git_info: { readOnlyHint: true },
  localbridge_git_status: { readOnlyHint: true },
  localbridge_git_diff: { readOnlyHint: true },
  localbridge_git_log: { readOnlyHint: true },
  localbridge_command_classify: { readOnlyHint: true },
  localbridge_job_status: { readOnlyHint: true },
  localbridge_job_logs: { readOnlyHint: true },
  localbridge_job_list: { readOnlyHint: true },
  localbridge_approval_status: { readOnlyHint: true },

  // Modifying / Action tools
  localbridge_file_create: { readOnlyHint: false, idempotentHint: false },
  localbridge_file_write: { readOnlyHint: false, idempotentHint: true },
  localbridge_file_patch: { readOnlyHint: false, idempotentHint: false },
  localbridge_file_delete: { readOnlyHint: false, destructiveHint: true },
  localbridge_file_restore: { readOnlyHint: false, destructiveHint: true },
  localbridge_command_run: { readOnlyHint: false },
  localbridge_job_start: { readOnlyHint: false },
  localbridge_job_cancel: { readOnlyHint: false, destructiveHint: true },
  localbridge_build_start: { readOnlyHint: false },
  localbridge_test_start: { readOnlyHint: false },
};

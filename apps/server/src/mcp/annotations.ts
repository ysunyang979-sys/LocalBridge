import type { ToolAnnotations } from "./types.js";

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // Read-only tools
  localbridge_environment_detect: { readOnlyHint: true },
  localbridge_project_detect: { readOnlyHint: true },
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
  localbridge_code_document_symbols: { readOnlyHint: true },
  localbridge_code_workspace_symbols: { readOnlyHint: true },
  localbridge_code_definition: { readOnlyHint: true },
  localbridge_code_references: { readOnlyHint: true },
  localbridge_code_hover: { readOnlyHint: true },
  localbridge_code_diagnostics: { readOnlyHint: true },
  localbridge_code_call_hierarchy: { readOnlyHint: true },
  localbridge_code_impact: { readOnlyHint: true },

  // Modifying / Action tools
  localbridge_file_create: { readOnlyHint: false, idempotentHint: false },
  localbridge_file_write: { readOnlyHint: false, idempotentHint: true },
  localbridge_file_patch: { readOnlyHint: false, idempotentHint: false },
  localbridge_file_delete: { readOnlyHint: false, destructiveHint: true },
  localbridge_file_restore: { readOnlyHint: false, destructiveHint: true },
  localbridge_fs_delete: { readOnlyHint: false, destructiveHint: true },
  localbridge_fs_move: { readOnlyHint: false, destructiveHint: false },
  localbridge_fs_copy: { readOnlyHint: false, destructiveHint: false },
  localbridge_fs_mkdir: { readOnlyHint: false, destructiveHint: false },
  localbridge_git_stage: { readOnlyHint: false, idempotentHint: true },
  localbridge_git_unstage: { readOnlyHint: false, idempotentHint: true },
  localbridge_git_branch_create: { readOnlyHint: false, idempotentHint: false },
  localbridge_git_branch_switch: { readOnlyHint: false, idempotentHint: false },
  localbridge_git_commit: { readOnlyHint: false, idempotentHint: false },
  localbridge_command_run: { readOnlyHint: false, openWorldHint: true },
  localbridge_job_start: { readOnlyHint: false, openWorldHint: true },
  localbridge_job_cancel: { readOnlyHint: false, destructiveHint: true },
  localbridge_build_start: { readOnlyHint: false, openWorldHint: true },
  localbridge_test_start: { readOnlyHint: false, openWorldHint: true },

  // Workflow Session tools
  localbridge_session_list: { readOnlyHint: true },
  localbridge_session_status: { readOnlyHint: true },
  localbridge_session_events: { readOnlyHint: true },
  localbridge_session_handoff: { readOnlyHint: true },
  localbridge_session_start: { readOnlyHint: false, destructiveHint: false },
  localbridge_session_checkpoint: { readOnlyHint: false, destructiveHint: false },
  localbridge_session_finish: { readOnlyHint: false, destructiveHint: false },

  // Managed Worktree tools
  localbridge_worktree_list: { readOnlyHint: true },
  localbridge_worktree_status: { readOnlyHint: true },
  localbridge_worktree_diff: { readOnlyHint: true },
  localbridge_worktree_create: { readOnlyHint: false, destructiveHint: false },
  localbridge_worktree_remove: { readOnlyHint: false, destructiveHint: true },

  // Persistent Runtime tools
  localbridge_runtime_list: { readOnlyHint: true },
  localbridge_runtime_status: { readOnlyHint: true },
  localbridge_runtime_logs: { readOnlyHint: true },
  localbridge_runtime_start: { readOnlyHint: false, openWorldHint: true },
  localbridge_runtime_restart: { readOnlyHint: false, openWorldHint: true },
  localbridge_runtime_stop: { readOnlyHint: false, destructiveHint: true },

  // Skills tools
  localbridge_skill_list: { readOnlyHint: true },
  localbridge_skill_get: { readOnlyHint: true },
  localbridge_skill_match: { readOnlyHint: true },

  // Laya Decision Intelligence tools
  localbridge_laya_status: { readOnlyHint: true },
  localbridge_laya_assess: { readOnlyHint: true },

  // Terminal tools
  localbridge_terminal_start: { readOnlyHint: false, openWorldHint: true },
  localbridge_terminal_write: { readOnlyHint: false, openWorldHint: true },
  localbridge_terminal_read: { readOnlyHint: true },
  localbridge_terminal_resize: { readOnlyHint: false, idempotentHint: true },
  localbridge_terminal_status: { readOnlyHint: true },
  localbridge_terminal_stop: { readOnlyHint: false, destructiveHint: true },
  localbridge_terminal_list: { readOnlyHint: true },

  // Process tools
  localbridge_process_list: { readOnlyHint: true },
  localbridge_process_status: { readOnlyHint: true },
  localbridge_process_kill: { readOnlyHint: false, destructiveHint: true },
  localbridge_process_tree: { readOnlyHint: true },

  // Port tools
  localbridge_port_list: { readOnlyHint: true },
  localbridge_port_kill: { readOnlyHint: false, destructiveHint: true },

  // Long-term Agent Task tools
  localbridge_agent_task_create: { readOnlyHint: false, openWorldHint: true },
  localbridge_agent_task_status: { readOnlyHint: true },
  localbridge_agent_task_logs: { readOnlyHint: true },
  localbridge_agent_task_cancel: { readOnlyHint: false, destructiveHint: true },
  localbridge_agent_task_pause: { readOnlyHint: false },
  localbridge_agent_task_resume: { readOnlyHint: false },
  localbridge_agent_task_list: { readOnlyHint: true },
  localbridge_agent_task_approve: { readOnlyHint: false },
};


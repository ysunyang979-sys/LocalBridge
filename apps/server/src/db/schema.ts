export interface TokenRow {
  id: string;
  type: "mcp" | "runner";
  token_hash: string;
  name: string;
  scopes: string; // JSON string array
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
}

export interface RunnerRow {
  id: string;
  device_name: string;
  platform: string;
  version: string;
  allowed_roots: string; // JSON string array
  capabilities: string; // JSON string object
  system_info: string; // JSON string object
  status: string;
  last_seen_at: number | null;
  created_at: number;
}

export interface ProjectRow {
  id: string;
  runner_id: string;
  name: string;
  enabled: number; // 0 or 1
  access_mode: string; // 'read-only' or 'read-write'
  execution_mode?: string; // 'disabled', 'safe-only', or 'project-code'
  first_seen_at: number;
  last_seen_at: number;
}

export interface AuditLogRow {
  id: string;
  timestamp: number;
  client_id: string | null;
  project_id: string | null;
  tool: string;
  arguments_summary: string | null;
  result_summary: string | null;
  duration_ms: number | null;
  risk_level: string;
  decision_source?: string | null;
  actor_display_name?: string | null;
}

export interface ProjectTrustPolicyRow {
  project_id: string;
  trust_level: string;
  file_policy: string;
  command_policy: string;
  protected_files_policy: string;
  custom_rules: string | null; // JSON string
  updated_at: number;
}

export interface SystemSettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface MigrationRow {
  version: number;
  name: string;
  applied_at: number;
}

export interface JobRow {
  id: string;
  project_id: string;
  runner_id: string | null;
  command_kind: string;
  risk: string;
  state: string;
  created_at: number;
  queued_at: number | null;
  started_at: number | null;
  finished_at: number | null;
  exit_code: number | null;
  signal: string | null;
  timeout_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  output_truncated: number;
  approval_id: string | null;
}

export interface WorkflowSessionRow {
  id: string;
  project_id: string;
  title: string | null;
  goal: string;
  state: string;
  created_at: number;
  updated_at: number;
  last_activity_at: number;
  finished_at: number | null;
  created_by: string;
  finished_by: string | null;
  finish_reason: string | null;
  final_note: string | null;
  event_count: number;
  events_truncated: number;
  latest_checkpoint_at: number | null;
}

export interface WorkflowSessionEventRow {
  id: string;
  session_id: string;
  project_id: string;
  event_type: string;
  source: string;
  ref_type: string | null;
  ref_id: string | null;
  summary_json: string | null;
  created_at: number;
}

export interface WorkflowSessionCheckpointRow {
  id: string;
  session_id: string;
  summary: string;
  next_steps_json: string | null;
  blockers_json: string | null;
  created_at: number;
  created_by: string;
}

export interface WorkflowSessionFileRow {
  session_id: string;
  relative_path: string;
  first_touched_at: number;
  last_touched_at: number;
  read_count: number;
  write_count: number;
  patch_count: number;
  delete_count: number;
}

export interface ManagedWorktreeRow {
  id: string;
  project_id: string;
  session_id: string | null;
  repository_root: string;
  worktree_path: string;
  branch_name: string;
  base_ref: string;
  base_commit: string;
  head_commit: string;
  state: string;
  created_at: number;
  updated_at: number;
  removed_at: number | null;
  created_by: string;
}

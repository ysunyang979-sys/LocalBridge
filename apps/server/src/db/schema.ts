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


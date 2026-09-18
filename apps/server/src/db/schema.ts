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
}

export interface MigrationRow {
  version: number;
  name: string;
  applied_at: number;
}

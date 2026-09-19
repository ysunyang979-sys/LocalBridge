-- 0004_project_trust_policies.sql
-- Store project trust policies and system settings (operator display name)

CREATE TABLE IF NOT EXISTS project_trust_policies (
  project_id TEXT PRIMARY KEY,
  trust_level TEXT NOT NULL DEFAULT 'standard',
  file_policy TEXT NOT NULL DEFAULT 'standard',
  command_policy TEXT NOT NULL DEFAULT 'ask',
  protected_files_policy TEXT NOT NULL DEFAULT 'always-ask',
  custom_rules TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE audit_logs ADD COLUMN decision_source TEXT;
ALTER TABLE audit_logs ADD COLUMN actor_display_name TEXT;

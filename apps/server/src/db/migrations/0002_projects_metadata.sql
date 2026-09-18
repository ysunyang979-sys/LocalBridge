-- 0002_projects_metadata.sql
-- Update projects table to store only public metadata without physical root paths

CREATE TABLE IF NOT EXISTS projects_metadata (
  id TEXT PRIMARY KEY,
  runner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- Safely migrate any existing records from initial schema
INSERT OR IGNORE INTO projects_metadata (id, runner_id, name, enabled, first_seen_at, last_seen_at)
SELECT id, '', name, enabled, created_at, updated_at FROM projects;

DROP TABLE projects;

ALTER TABLE projects_metadata RENAME TO projects;

CREATE INDEX IF NOT EXISTS idx_projects_runner ON projects(runner_id);
CREATE INDEX IF NOT EXISTS idx_projects_enabled ON projects(enabled);

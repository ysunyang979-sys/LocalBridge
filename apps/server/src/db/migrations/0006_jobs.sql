-- 0006_jobs.sql
-- Create jobs persistence table

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  runner_id TEXT,
  command_kind TEXT NOT NULL,
  risk TEXT NOT NULL DEFAULT 'SAFE',
  state TEXT NOT NULL DEFAULT 'queued',
  created_at INTEGER NOT NULL,
  queued_at INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  exit_code INTEGER,
  signal TEXT,
  timeout_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  output_truncated INTEGER NOT NULL DEFAULT 0,
  approval_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_runner_id ON jobs(runner_id);

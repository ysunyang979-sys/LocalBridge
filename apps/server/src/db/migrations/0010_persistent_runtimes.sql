-- 0010_persistent_runtimes.sql
-- Create tables for Persistent Runtimes and their runtime generations

CREATE TABLE IF NOT EXISTS persistent_runtimes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,
  worktree_id TEXT,
  name TEXT,
  kind TEXT NOT NULL,
  command_category TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'starting',
  generation INTEGER NOT NULL DEFAULT 1,
  launch_spec_json TEXT NOT NULL,
  workspace_mode TEXT NOT NULL,
  pid INTEGER,
  exit_code INTEGER,
  signal TEXT,
  restart_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  stopped_at INTEGER,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'chat'
);

CREATE TABLE IF NOT EXISTS runtime_generations (
  id TEXT PRIMARY KEY,
  runtime_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  pid INTEGER,
  state TEXT NOT NULL,
  exit_code INTEGER,
  signal TEXT,
  started_at INTEGER NOT NULL,
  stopped_at INTEGER,
  FOREIGN KEY (runtime_id) REFERENCES persistent_runtimes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_persistent_runtimes_project_id ON persistent_runtimes(project_id);
CREATE INDEX IF NOT EXISTS idx_persistent_runtimes_session_id ON persistent_runtimes(session_id);
CREATE INDEX IF NOT EXISTS idx_persistent_runtimes_worktree_id ON persistent_runtimes(worktree_id);
CREATE INDEX IF NOT EXISTS idx_persistent_runtimes_state ON persistent_runtimes(state);
CREATE INDEX IF NOT EXISTS idx_persistent_runtimes_created_at ON persistent_runtimes(created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_generations_runtime_id ON runtime_generations(runtime_id);

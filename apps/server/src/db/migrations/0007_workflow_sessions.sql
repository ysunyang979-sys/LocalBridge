-- 0007_workflow_sessions.sql
-- Create tables for Workflow Sessions, events, checkpoints, and touched files tracking

CREATE TABLE IF NOT EXISTS workflow_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  goal TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  finished_at INTEGER,
  created_by TEXT NOT NULL DEFAULT 'chat',
  finished_by TEXT,
  finish_reason TEXT,
  final_note TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  events_truncated INTEGER NOT NULL DEFAULT 0,
  latest_checkpoint_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workflow_sessions_project_id ON workflow_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_sessions_state ON workflow_sessions(state);
CREATE INDEX IF NOT EXISTS idx_workflow_sessions_created_at ON workflow_sessions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_sessions_active_project ON workflow_sessions(project_id) WHERE state = 'active';

CREATE TABLE IF NOT EXISTS workflow_session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  summary_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_session_id ON workflow_session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_project_id ON workflow_session_events(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_session_created ON workflow_session_events(session_id, created_at);

CREATE TABLE IF NOT EXISTS workflow_session_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  next_steps_json TEXT,
  blockers_json TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'chat'
);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_session_id ON workflow_session_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_created_at ON workflow_session_checkpoints(created_at);

CREATE TABLE IF NOT EXISTS workflow_session_files (
  session_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  first_touched_at INTEGER NOT NULL,
  last_touched_at INTEGER NOT NULL,
  read_count INTEGER NOT NULL DEFAULT 0,
  write_count INTEGER NOT NULL DEFAULT 0,
  patch_count INTEGER NOT NULL DEFAULT 0,
  delete_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_workflow_files_session_id ON workflow_session_files(session_id);

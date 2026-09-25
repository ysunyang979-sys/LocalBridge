-- 0014_terminal_and_agent_tasks.sql
-- Add persistent tables for Terminal Sessions, Long-term Agent Tasks, Checkpoints, and Logs

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,
  agent_task_id TEXT,
  shell TEXT NOT NULL,
  cols INTEGER NOT NULL DEFAULT 80,
  rows INTEGER NOT NULL DEFAULT 24,
  state TEXT NOT NULL DEFAULT 'running',
  pid INTEGER,
  process_start_time TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  stopped_at INTEGER,
  exit_code INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_project_id ON terminal_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_state ON terminal_sessions(state);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  resource_policy_json TEXT NOT NULL,
  resource_usage_json TEXT NOT NULL,
  iteration INTEGER NOT NULL DEFAULT 0,
  action_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  same_action_repeats INTEGER NOT NULL DEFAULT 0,
  last_failure_fingerprint TEXT,
  waiting_for_approval INTEGER NOT NULL DEFAULT 0,
  pending_approval_id TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  deadline_at INTEGER NOT NULL,
  finished_at INTEGER,
  schema_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_project_id ON agent_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_state ON agent_tasks(state);

CREATE TABLE IF NOT EXISTS agent_task_checkpoints (
  id TEXT PRIMARY KEY,
  agent_task_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  iteration INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'observe',
  goal TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_task_checkpoints_task_id ON agent_task_checkpoints(agent_task_id);

CREATE TABLE IF NOT EXISTS agent_task_logs (
  id TEXT PRIMARY KEY,
  agent_task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  log_type TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (agent_task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_task_logs_task_id_seq ON agent_task_logs(agent_task_id, sequence);

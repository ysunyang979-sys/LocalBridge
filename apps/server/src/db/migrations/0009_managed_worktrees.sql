-- 0009_managed_worktrees.sql
-- Create table for Managed Worktrees and session associations

CREATE TABLE IF NOT EXISTS managed_worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  head_commit TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'creating',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  created_by TEXT NOT NULL DEFAULT 'chat'
);

CREATE INDEX IF NOT EXISTS idx_managed_worktrees_project_id ON managed_worktrees(project_id);
CREATE INDEX IF NOT EXISTS idx_managed_worktrees_state ON managed_worktrees(state);
CREATE INDEX IF NOT EXISTS idx_managed_worktrees_created_at ON managed_worktrees(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_worktrees_active_session ON managed_worktrees(session_id) WHERE state != 'removed';

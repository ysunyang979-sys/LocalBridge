-- 0001_initial.sql
-- Initial schema for LocalBridge Server

-- Tokens table (only token_hash is stored, never plaintext token)
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('mcp', 'runner')),
  token_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON tokens(type);

-- Registered runners table
CREATE TABLE IF NOT EXISTS runners (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  allowed_roots TEXT NOT NULL DEFAULT '[]',
  capabilities TEXT NOT NULL DEFAULT '{}',
  system_info TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Authorized projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_enabled ON projects(enabled);

-- Audit log for AI operations
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  client_id TEXT,
  project_id TEXT,
  tool TEXT NOT NULL,
  arguments_summary TEXT,
  result_summary TEXT,
  duration_ms INTEGER,
  risk_level TEXT NOT NULL DEFAULT 'SAFE'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);

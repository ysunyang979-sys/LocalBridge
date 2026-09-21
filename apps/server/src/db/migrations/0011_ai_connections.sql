-- 0011_ai_connections.sql
-- Create table for Model-Agnostic AI Client Connections & Tool Adapters

CREATE TABLE IF NOT EXISTS ai_connections (
  id TEXT PRIMARY KEY,
  client_type TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'native-mcp',
  status TEXT NOT NULL DEFAULT 'not_configured',
  transport TEXT NOT NULL DEFAULT 'http',
  endpoint TEXT NOT NULL DEFAULT 'http://127.0.0.1:18080/mcp',
  token_id TEXT,
  config_json TEXT,
  detected_config_path TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  tool_allowlist_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  last_connected_at INTEGER,
  last_error TEXT,
  FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_connections_client_type ON ai_connections(client_type);
CREATE INDEX IF NOT EXISTS idx_ai_connections_status ON ai_connections(status);
CREATE INDEX IF NOT EXISTS idx_ai_connections_token_id ON ai_connections(token_id);

-- Seed default standard AI connections if not already present
INSERT OR IGNORE INTO ai_connections (
  id, client_type, name, category, status, transport, endpoint, is_primary, created_at, updated_at
) VALUES (
  'conn_chatgpt',
  'chatgpt',
  'ChatGPT',
  'native-mcp',
  'not_configured',
  'tunnel',
  'https://tunnel.localbridge.dev',
  1,
  unixepoch() * 1000,
  unixepoch() * 1000
);

INSERT OR IGNORE INTO ai_connections (
  id, client_type, name, category, status, transport, endpoint, is_primary, created_at, updated_at
) VALUES (
  'conn_kimi',
  'kimi',
  'Kimi Code',
  'native-mcp',
  'not_configured',
  'http',
  'http://127.0.0.1:18080/mcp',
  0,
  unixepoch() * 1000,
  unixepoch() * 1000
);

INSERT OR IGNORE INTO ai_connections (
  id, client_type, name, category, status, transport, endpoint, is_primary, created_at, updated_at
) VALUES (
  'conn_claude',
  'claude',
  'Claude',
  'native-mcp',
  'not_configured',
  'http',
  'http://127.0.0.1:18080/mcp',
  0,
  unixepoch() * 1000,
  unixepoch() * 1000
);

INSERT OR IGNORE INTO ai_connections (
  id, client_type, name, category, status, transport, endpoint, is_primary, created_at, updated_at
) VALUES (
  'conn_gemini',
  'gemini',
  'Gemini CLI',
  'native-mcp',
  'not_configured',
  'streamable-http',
  'http://127.0.0.1:18080/mcp',
  0,
  unixepoch() * 1000,
  unixepoch() * 1000
);

INSERT OR IGNORE INTO ai_connections (
  id, client_type, name, category, status, transport, endpoint, is_primary, created_at, updated_at
) VALUES (
  'conn_deepseek',
  'deepseek',
  'DeepSeek',
  'tool-adapter',
  'not_configured',
  'http',
  'https://api.deepseek.com',
  0,
  unixepoch() * 1000,
  unixepoch() * 1000
);

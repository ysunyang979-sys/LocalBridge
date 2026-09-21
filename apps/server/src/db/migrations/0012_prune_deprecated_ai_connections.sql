-- 0012_prune_deprecated_ai_connections.sql
-- Pivot to dedicated ChatGPT Local AI Control Plane
-- Safely and idempotently remove deprecated non-ChatGPT connection records

DELETE FROM ai_connections WHERE id != 'conn_chatgpt' OR client_type != 'chatgpt';

-- Ensure conn_chatgpt exists and is marked as primary
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

UPDATE ai_connections SET is_primary = 1 WHERE id = 'conn_chatgpt';

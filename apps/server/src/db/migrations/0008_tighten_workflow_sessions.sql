-- 0008_tighten_workflow_sessions.sql
-- 1. Migrate legacy non-standard session states (aborted / paused) to abandoned
UPDATE workflow_sessions
SET state = 'abandoned',
    finished_at = COALESCE(finished_at, updated_at, strftime('%s', 'now') * 1000),
    finish_reason = COALESCE(finish_reason, 'migrated_legacy_aborted')
WHERE state = 'aborted';

UPDATE workflow_sessions
SET state = 'abandoned',
    finished_at = COALESCE(finished_at, updated_at, strftime('%s', 'now') * 1000),
    finish_reason = COALESCE(finish_reason, 'migrated_legacy_paused')
WHERE state = 'paused';

-- 2. Add triggers to strictly enforce the 3 valid states ('active', 'completed', 'abandoned')
CREATE TRIGGER IF NOT EXISTS trg_workflow_sessions_state_insert
BEFORE INSERT ON workflow_sessions
FOR EACH ROW
WHEN NEW.state NOT IN ('active', 'completed', 'abandoned')
BEGIN
  SELECT RAISE(FAIL, 'Invalid workflow_session state. Allowed: active, completed, abandoned');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_sessions_state_update
BEFORE UPDATE OF state ON workflow_sessions
FOR EACH ROW
WHEN NEW.state NOT IN ('active', 'completed', 'abandoned')
BEGIN
  SELECT RAISE(FAIL, 'Invalid workflow_session state. Allowed: active, completed, abandoned');
END;

-- 3. Enforce terminal state immutability (completed and abandoned sessions cannot be reopened or changed)
CREATE TRIGGER IF NOT EXISTS trg_workflow_sessions_state_terminal_update
BEFORE UPDATE OF state ON workflow_sessions
FOR EACH ROW
WHEN OLD.state IN ('completed', 'abandoned') AND NEW.state != OLD.state
BEGIN
  SELECT RAISE(FAIL, 'Cannot transition a terminal workflow_session (completed or abandoned)');
END;

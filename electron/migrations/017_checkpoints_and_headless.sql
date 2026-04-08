-- Migration 017: Session checkpoints for time-travel debugging + auto-recovery
-- Also adds headless mode support fields

-- Checkpoints: snapshots of session state at key moments
CREATE TABLE IF NOT EXISTS session_checkpoints (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  checkpoint_num INTEGER NOT NULL,
  label         TEXT,                -- e.g. "tool_call:Edit", "task_assigned", "manual"
  context       TEXT NOT NULL,       -- last N chars of output buffer (session context)
  task_text     TEXT,                -- current task/prompt at this point
  tokens_used   INTEGER DEFAULT 0,
  cost_usd      REAL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON session_checkpoints(session_id, checkpoint_num);

-- Recovery tracking: prevent infinite crash-restart loops
ALTER TABLE claude_sessions ADD COLUMN recovery_count INTEGER DEFAULT 0;
ALTER TABLE claude_sessions ADD COLUMN recovered_from TEXT;  -- checkpoint_id

-- Headless mode
ALTER TABLE claude_sessions ADD COLUMN is_headless INTEGER DEFAULT 0;
ALTER TABLE claude_sessions ADD COLUMN scheduled_by TEXT;     -- 'manual' | 'cron' | agent_id

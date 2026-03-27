CREATE TABLE IF NOT EXISTS hook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_name TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  trigger_time TEXT NOT NULL,
  trigger_reason TEXT,
  result TEXT NOT NULL CHECK(result IN ('blocked', 'passed', 'warned')),
  details TEXT,
  session_id TEXT,
  scope TEXT NOT NULL DEFAULT 'global',
  project_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hook_logs_hook_name ON hook_logs(hook_name);
CREATE INDEX IF NOT EXISTS idx_hook_logs_result ON hook_logs(result);
CREATE INDEX IF NOT EXISTS idx_hook_logs_trigger_time ON hook_logs(trigger_time);
CREATE INDEX IF NOT EXISTS idx_hook_logs_scope ON hook_logs(scope);

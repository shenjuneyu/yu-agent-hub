CREATE TABLE IF NOT EXISTS skill_settings (
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  project_path TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (name, scope, project_path)
);

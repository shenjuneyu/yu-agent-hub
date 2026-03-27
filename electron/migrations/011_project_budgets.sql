-- Project budgets table (was referenced in code but never created)
CREATE TABLE IF NOT EXISTS project_budgets (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    daily_limit        REAL DEFAULT 5.0,
    total_limit        REAL DEFAULT 50.0,
    daily_token_limit  INTEGER DEFAULT 500000,
    total_token_limit  INTEGER DEFAULT 10000000,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_budgets_project ON project_budgets(project_id);

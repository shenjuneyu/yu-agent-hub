-- Maestro Initial Schema: 10 tables

-- 1. projects
CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    template    TEXT,
    status      TEXT NOT NULL DEFAULT 'planning',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. sprints
CREATE TABLE IF NOT EXISTS sprints (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    goal         TEXT,
    status       TEXT NOT NULL DEFAULT 'planning',
    started_at   TEXT,
    completed_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);

-- 3. tasks
CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sprint_id       TEXT REFERENCES sprints(id) ON DELETE SET NULL,
    parent_task_id  TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'created',
    assigned_to     TEXT,
    created_by      TEXT,
    priority        TEXT DEFAULT 'medium',
    tags            TEXT,
    estimated_hours REAL,
    actual_hours    REAL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint   ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

-- 4. task_dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on)
);

-- 5. gates
CREATE TABLE IF NOT EXISTS gates (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sprint_id    TEXT REFERENCES sprints(id) ON DELETE SET NULL,
    gate_type    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    submitted_by TEXT,
    reviewer     TEXT,
    checklist    TEXT,
    submitted_at TEXT,
    reviewed_at  TEXT,
    decision     TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gates_project ON gates(project_id);
CREATE INDEX IF NOT EXISTS idx_gates_status  ON gates(status);

-- 6. claude_sessions
CREATE TABLE IF NOT EXISTS claude_sessions (
    id                 TEXT PRIMARY KEY,
    agent_id           TEXT NOT NULL,
    task_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
    model              TEXT NOT NULL,
    system_prompt_hash TEXT,
    status             TEXT NOT NULL DEFAULT 'running',
    input_tokens       INTEGER DEFAULT 0,
    output_tokens      INTEGER DEFAULT 0,
    cost_usd           REAL DEFAULT 0,
    tool_calls_count   INTEGER DEFAULT 0,
    turns_count        INTEGER DEFAULT 0,
    started_at         TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at           TEXT,
    duration_ms        INTEGER,
    result_summary     TEXT,
    error_message      TEXT,
    metadata           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_agent   ON claude_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON claude_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON claude_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON claude_sessions(started_at);

-- 7. session_events
CREATE TABLE IF NOT EXISTS session_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    subtype    TEXT,
    data       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sevents_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_sevents_type    ON session_events(type);

-- 8. decisions
CREATE TABLE IF NOT EXISTS decisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    reason     TEXT,
    category   TEXT NOT NULL DEFAULT 'general',
    status     TEXT NOT NULL DEFAULT 'active',
    decided_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_decisions_project  ON decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_category ON decisions(category);
CREATE INDEX IF NOT EXISTS idx_decisions_status   ON decisions(status);

-- 9. sprint_reviews
CREATE TABLE IF NOT EXISTS sprint_reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_id    TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    review_type  TEXT NOT NULL,
    content      TEXT NOT NULL,
    generated_by TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sreviews_sprint ON sprint_reviews(sprint_id);

-- 10. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor      TEXT NOT NULL,
    target     TEXT NOT NULL,
    details    TEXT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_type    ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 11. user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT NOT NULL UNIQUE,
    value      TEXT NOT NULL,
    category   TEXT DEFAULT 'general',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

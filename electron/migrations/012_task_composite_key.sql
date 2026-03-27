-- Migration 012: Change tasks PK to composite (project_id, id)
-- Reason: Task IDs like "T1" collide across projects; sprint subfolder scoping
-- also produces IDs like "sprint-1/T1" which are unique per project but not globally.

-- 1. Recreate tasks with composite primary key
CREATE TABLE tasks_new (
    id              TEXT NOT NULL,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sprint_id       TEXT REFERENCES sprints(id) ON DELETE SET NULL,
    parent_task_id  TEXT,
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
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, id)
);

INSERT INTO tasks_new SELECT * FROM tasks
  WHERE project_id IN (SELECT id FROM projects);

DROP TABLE IF EXISTS tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint   ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);

-- 2. Recreate task_dependencies with project_id scope
CREATE TABLE task_dependencies_new (
    project_id TEXT NOT NULL,
    task_id    TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id, depends_on),
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, depends_on) REFERENCES tasks(project_id, id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO task_dependencies_new (project_id, task_id, depends_on)
  SELECT t.project_id, td.task_id, td.depends_on
  FROM task_dependencies td
  JOIN tasks t ON td.task_id = t.id;

DROP TABLE IF EXISTS task_dependencies;
ALTER TABLE task_dependencies_new RENAME TO task_dependencies;

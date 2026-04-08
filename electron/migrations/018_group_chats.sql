-- Migration 018: Group chat sessions for multi-agent discussions

CREATE TABLE IF NOT EXISTS group_chats (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  agent_ids   TEXT NOT NULL,     -- JSON array of agent IDs
  project_id  TEXT,
  max_rounds  INTEGER DEFAULT 3,
  status      TEXT NOT NULL DEFAULT 'active',  -- active / completed / cancelled
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_chats_status ON group_chats(status);

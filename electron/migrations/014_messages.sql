-- Migration 014: Messages table for cross-session agent communication
-- Enables bi-directional messaging between any agents, with persistence and delivery tracking

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / delivered / read
  project_id TEXT,
  session_id TEXT,          -- session that delivered this message
  reply_to TEXT,            -- references another message id
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages(to_agent, status);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to);

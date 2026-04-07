-- Migration 016: Agent memory for cross-session context persistence
-- Agents can store key-value memories that survive across sessions.
-- Inspired by CrewAI's long-term memory system.

CREATE TABLE IF NOT EXISTS agent_memory (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  project_id  TEXT,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_unique ON agent_memory(agent_id, project_id, key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, project_id);

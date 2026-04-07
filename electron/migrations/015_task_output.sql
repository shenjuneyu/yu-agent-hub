-- Migration 015: Add output_summary to tasks for task output chaining
-- When a task completes, its output is stored here so dependent tasks can consume it as context.

ALTER TABLE tasks ADD COLUMN output_summary TEXT;

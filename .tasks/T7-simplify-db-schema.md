# 精簡 DB schema

| 欄位 | 值 |
|------|-----|
| ID | T7 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P1 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

在 electron/services/database.ts 中移除以下表的 CREATE TABLE：

1. notion_connection
2. notion_databases
3. sync_mapping
4. sync_queue
5. sync_log
6. doc_sync_mapping
7. doc_sync_folders
8. messages
9. objections
10. conversations
11. agent_runs
12. memory_blocks
13. execution_failures
14. project_budgets

保留：projects, sprints, tasks, task_dependencies, gates, claude_sessions, session_events, decisions, audit_logs, user_preferences, sprint_reviews, schema_migrations

重建 migration（不保留歷史版本），確保 schema 乾淨。

## 驗收標準

- [ ] database.ts 只包含保留表的 CREATE TABLE
- [ ] migration 歷史已清理
- [ ] 應用啟動後 DB 正常初始化

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

# 移除 19 個不需要的服務

| 欄位 | 值 |
|------|-----|
| ID | T3 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

刪除 electron/services/ 下的以下檔案：

1. sync-manager.ts
2. doc-sync-manager.ts
3. markdown-notion.ts
4. notion-api.ts
5. sync-scheduler.ts
6. auth-manager.ts
7. github-api.ts
8. communication-bus.ts
9. orchestrator.ts
10. delegation-parser.ts
11. browse-server.ts
12. cost-tracker.ts
13. error-recovery.ts
14. context-manager.ts
15. memory-manager.ts
16. notification-service.ts
17. updater-service.ts
18. crash-reporter.ts
19. shortcut-service.ts

同時刪除 electron/mcp/ 目錄（Browse MCP）。

刪除後修正所有 import 引用錯誤，特別注意 session-manager.ts 對被砍服務的引用。

## 驗收標準

- [ ] 19 個服務檔案已刪除
- [ ] electron/mcp/ 已刪除
- [ ] 無 import 引用到已刪除的檔案

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

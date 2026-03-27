# 修正 session-manager 的依賴清理

| 欄位 | 值 |
|------|-----|
| ID | T8 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

session-manager.ts（1654 LOC）是核心服務，可能引用到被砍的：
- memory-manager（記憶注入）
- communication-bus（Agent 間通訊）
- delegation-parser（委派解析）
- orchestrator（排程）
- notification-service（通知）
- error-recovery（錯誤恢復）
- context-manager（context 組裝）

逐一檢查 import，移除引用，必要時將關鍵邏輯內聯或簡化。

**核心功能不能壞**：spawn、stop、PTY I/O、輸出解析、事件發射。

## 驗收標準

- [ ] session-manager.ts 無 import 引用到已刪除服務
- [ ] spawn() 正常運作
- [ ] stop() 正常運作
- [ ] PTY 輸入/輸出正常

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

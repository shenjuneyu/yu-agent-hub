# 移除 4 個 Store

| 欄位 | 值 |
|------|-----|
| ID | T5 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

刪除以下 Pinia store：
1. src/stores/auth.ts
2. src/stores/costs.ts
3. src/stores/objections.ts
4. src/stores/sync.ts

刪除後修正所有元件中對這些 store 的 import 和引用。

## 驗收標準

- [ ] 4 個 store 檔案已刪除
- [ ] 無元件引用到已刪除的 store

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

# 移除不需要的依賴

| 欄位 | 值 |
|------|-----|
| ID | T2 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

從 package.json 移除以下依賴：
- `monaco-editor`（~6.8MB）
- `@notionhq/client`
- `simple-git`

移除後執行 `npm install` 更新 lockfile。

## 驗收標準

- [ ] package.json 不含以上 3 個依賴
- [ ] package-lock.json 已更新
- [ ] `npm install` 成功

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

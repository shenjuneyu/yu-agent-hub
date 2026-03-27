# 啟動驗證

| 欄位 | 值 |
|------|-----|
| ID | T11 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

在 T10 通過後，執行完整驗證：

1. `npm run dev` 啟動應用
2. 檢查 5 個頁面是否正常載入（無白屏、無 console error）
3. 開啟一個 Session（選任意 Agent + 測試專案）
4. 確認 xterm.js 輸出正常
5. 停止 Session
6. 建立一個新專案（ProjectCreateModal）
7. 檢查首屏 bundle 大小（DevTools Network）

## 驗收標準

- [ ] 應用正常啟動
- [ ] Dashboard, Sessions, Projects, ProjectDetail, Settings 可進入
- [ ] Session spawn + xterm 輸出正常
- [ ] Session stop 正常
- [ ] 建立專案正常
- [ ] 首屏 bundle < 3MB

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

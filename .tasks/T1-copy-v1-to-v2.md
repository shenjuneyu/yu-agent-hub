# 複製 v1 程式碼到 v2 + git init

| 欄位 | 值 |
|------|-----|
| ID | T1 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

將 C:\agent-hub 的程式碼複製到 C:\projects\AgentHub，包含：
- electron/ 目錄（完整）
- src/ 目錄（完整）
- agents/ 目錄（完整）
- knowledge/ 目錄（完整）
- tests/ 目錄
- e2e/ 目錄
- 設定檔：package.json, tsconfig*.json, electron.vite.config.ts, vitest.config.ts, electron-builder.yml, .prettierrc, .gitignore, .env.example
- build/ 目錄（icon 等打包資源）
- scripts/ 目錄

**不複製**：node_modules/, dist/, out/, .git/, .env, mockups/, docs/, screenshots/, playwright-report/, test-results/

複製後 git init 建立新 repo，首次 commit。

## 驗收標準

- [ ] 程式碼完整複製到 v2 目錄
- [ ] git init + 初始 commit 完成
- [ ] 目錄結構正確（不含 node_modules 等排除項）

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立，Sprint 1 G0 通過後

### 2026-03-24 — T1 完成
- 305 檔案、54,612 行程式碼複製完成
- git init + 初始 commit 2ddd937
- npm install 成功（400 套件）
- node-pty 使用 prebuilt binary（無需 electron-rebuild）
- 已保留 v2 原有的 CLAUDE.md, proposal/, .tasks/, .knowledge/

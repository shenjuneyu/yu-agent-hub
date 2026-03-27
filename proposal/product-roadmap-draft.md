# 產品路線圖草稿

> **維護者**: PM
> **最後更新**: 2026-03-25

---

## 階段總覽

```
Phase 1: 基礎建設（Sprint 1-4）— 讓系統能跑
Phase 2: 用戶體驗（Sprint 5+）— 讓系統好用
Phase 3: 商業化（待定）— 讓系統有價值
```

---

## Phase 1: 基礎建設

| Sprint | 目標 | 狀態 | 核心交付 |
|--------|------|------|---------|
| Sprint 1 | 搬家 + 清理 | ✅ 完成 | v1→v2 精簡，305 檔 → 核心骨架，bundle 1.2MB |
| Sprint 2 | Harness 基礎 | ✅ 完成 | hook-manager + stop-validator + 9 Skill 模板 + spawn 自動注入 |
| Sprint 2.5 | 知識架構優化 | ✅ 完成 | CLAUDE.md 瘦身 + 模板重構 + Hook 升級 + 3 新 Skill |
| Sprint 3 | UI 恢復 + FileWatcher | ✅ 完成 | 3 頁面恢復 + .md→DB→GUI 即時同步 + Dashboard 監控 |
| Sprint 4 | 公司管理 Agent | ✅ 完成 | company-manager Agent + 跨專案讀取 + /knowledge-feedback Skill |

### Sprint 2.5 備忘（知識架構優化）

- CLAUDE.md 263→~78 行索引（原則 1：地圖不是百科全書）
- 子專案模板瘦身：web-app 533→~100, 其餘→~65
- 抽取共用規則：`project-rules.md`（~120 行）+ `team-workflow.md`（~150 行）
- 禁止指令升級 PreToolUse Hook（原則 2：用工具強制）
- 新增 3 Skill：/project-kickoff, /pre-deploy, /harness-audit
- 強化 /review Skill：步驟偵測 + 設計稿比對

### Sprint 3 備忘

- 恢復 GatesView + TaskBoardView + AgentsView
- AgentsView 隱藏 Prompt Preview（不顯示給用戶）
- FileWatcher 同步（.tasks/ + dev-plan 第 10 節 → DB → Dashboard）
- Dashboard 監控：Sprint 進度 + 任務狀態 + Gate 紀錄 + 活躍 Session

### Sprint 4 備忘

- ✅ 公司管理 Agent 定義（`agents/definitions/studio-operations/company-manager.md`）
- ✅ workDir 固定為 AgentHub，透過絕對路徑讀取子專案 `.knowledge/`
- ✅ PromptAssembler 自動注入已知子專案清單（含 workDir + 檔案路徑提示）
- ✅ `/knowledge-feedback` Skill（掃描踩坑 → 分類 → 建議規範修改 → 老闆確認 → 更新）
- ✅ SkillGenerator 支援 AgentHub-only Skill（不部署到子專案）
- ✅ stores/agents.ts 新增 company-manager 圖示 + 中文名稱 + 中文簡介
- ✅ KnowledgeView 恢復 + Session 內嵌（可在知識庫頁面直接開 company-manager Session）
- ✅ 知識樹載入修復（knowledge/company/ 完整顯示）

---

## Phase 2: 用戶體驗

| Sprint | 目標 | 狀態 | 核心交付 |
|--------|------|------|---------|
| Sprint 5A | UI/UX 設計 | ✅ 完成 | design-system.md（14 章）+ 9 頁 mockup + 元件庫，G1 通過 |
| Sprint 5B | 前端實作設計稿 | ✅ 完成 | 9 頁 UI 全面改版，Token 化，bundle 1.4MB，G2+G3 通過 |

### Sprint 5A 備忘（UI/UX 設計）

- ✅ `.knowledge/design-system.md`（14 章 458 行）：設計原則 + 色彩/字體/間距/圓角/陰影/動畫 Token 系統
- ✅ 9 頁 mockup（HTML + JPG）：Dashboard / Sessions / Projects / ProjectDetail / TaskBoard / Gates / Agents / Knowledge / Settings
- ✅ 元件庫 `docs/design/components.html`：12 類共用元件（Button/Card/Tag/StatCard/StatusDot/Modal/Form/Progress/EmptyState/Loading/Toast/Sidebar/Table）
- ✅ 每頁含正常/空狀態/Loading 三態切換
- ✅ 暗色主題為預設，完整語義色映射（Session 10 狀態 / Task 6 狀態 / Gate 4 狀態）
- ✅ Sidebar 三組分類：高頻（儀表板/工作階段）/ 管理（專案/任務/關卡/團隊/知識庫）/ 系統（設定）
- G1 通過：2026-03-25，老闆審核通過

### Sprint 5B 備忘（前端實作設計稿）

- ✅ 9 頁全部依設計稿重構：Dashboard / Sessions / Projects / ProjectDetail / TaskBoard / Gates / Agents / Knowledge / Settings
- ✅ Design Token 全面 CSS 變數化（`var(--color-*)`），hardcoded 色值 = 0
- ✅ 共用元件庫 `src/components/base/`
- ✅ 每頁 shimmer skeleton loading + empty state
- ✅ Script 邏輯零修改（Pinia store / IPC / composable 不動）
- ✅ typecheck 0 error、bundle 1.4MB < 2MB
- G2+G3 通過：2026-03-25，老闆審核通過

| Sprint 6 | Harness 管理（Skill + Hook 自訂） | ✅ 完成 | harness-manager Agent + 15 IPC（含 Scope）+ HarnessView 3 Tab + 觸發紀錄，G2+G3 附條件通過 |

### Sprint 6 備忘（Harness 管理）

- ✅ **harness-manager Agent** 定義（7 步引導對話，含作用範圍確認）
- ✅ **15 個 IPC 通道**（Skill 7 + Hook 6 + Log 2），全部支援 scope（global/project）
- ✅ **HarnessView** 頁面（Sidebar「⚡ Harness」），3 Tab：Skill / Hook / 觸發紀錄
- ✅ **Skill Tab**：左側列表（來源 Tag + Scope Tag + Toggle + 搜尋 + 專案篩選）+ 右側預覽/Agent Session 雙模式
- ✅ **Hook Tab**：同上，差異為類型 Tag（PreToolUse 青/PostToolUse 橙/Stop 紅）
- ✅ **觸發紀錄 Tab**：統計卡片 + 紀錄表格 + 篩選
- ✅ **Scope 支援**：全域 vs 專案專用，存放路徑分離，篩選器三 Tab 統一
- ✅ **hook_logs DB 表** + migration + 3 索引
- ⚠️ **Agent Session 內嵌為佔位** — 待 PTY 整合（記入 Backlog B14）
- G1 通過（補件後）：2026-03-25
- G2+G3 附條件通過：2026-03-25

| Sprint 7 | 任務自動追蹤（Skill + Parser + UI） | ✅ 完成 | 4 Skill（dispatch/status/done 強化/delegation 更新）+ Parser 擴充 + TaskBoard 卡片 + EventBus 鏈路修復，G2+G3 通過 |

### Sprint 7 備忘（任務自動追蹤）

- **核心**：老闆 /task-dispatch → 自動建 .tasks/ + 記 dev-plan → 狀態流轉全程追蹤 → GUI 即時反映
- **新增 Skill**：`/task-dispatch`（老闆建任務）、`/task-status`（中間狀態變更）
- **強化 Skill**：`/task-done`（追加事件紀錄）、`/task-delegation`（格式統一 + 加依賴/預估）
- **.tasks/ 標準格式**：加入「依賴」+「預估」欄位，事件紀錄追蹤所有狀態變更
- **dev-plan 第 10 節**：只記完成結果（維持現有）
- **parseTaskFile() 擴充**：解析「依賴」+ 相容「預估」/「預估工時」
- **DB migration**：tasks 表加 depends_on 欄位
- **TaskBoard 卡片**：顯示預估/依賴/指派人
- G0 通過：2026-03-25

| Sprint 8 | Harness 強化（Hook 缺口 + 擴充） | ✅ 完成 | H1-H4 四個 Gate Hook + 觸發統計（7日趨勢+Top5）+ 模板路徑修正 19 處，G2+G3 通過 |

### Sprint 8 備忘（Harness 強化）

- **H1 G1 Hook**：PreToolUse/Edit — 偵測 components/ 修改時檢查是否有對應 mockup 設計稿
- **H2 G3 Hook**：Stop Hook 擴充 — test coverage 低於門檻時阻擋
- **H3 G4 Hook**：PostToolUse/Edit — code 改了但 .knowledge/ 沒更新時警告
- **H4 G5 Hook**：pre-deploy 自動檢查（CI 綠燈、env 一致）
- **B12 觸發紀錄統計**：HarnessView 觸發紀錄 Tab 加入活躍度統計（日/週/月趨勢）
- **D1 模板路徑修正**：子專案模板硬編碼 `C:\agent-hub` → 相對路徑
- G0 通過：2026-03-26

| Sprint 9 | 知識閉環 + Skill 擴充 + 商業化基礎 | ✅ 完成 | 踩坑閉環（14天提醒+Dashboard 紅卡）+ 跨專案回饋（postmortem-common.md）+ Skill 匯入匯出 + /product-diagnosis Skill，G2+G3 通過 |

### Sprint 9 備忘（知識閉環 + 商業化）

- **B1 踩坑閉環**：postmortem-log.md 加到期日 + `pitfall:getOverdue` IPC + `/pitfall-resolve` Skill + Dashboard 提醒
- **B8 跨專案回饋**：`/knowledge-feedback` 擴充通用性判斷 + `postmortem-common.md` + 新專案自動繼承
- **B11 Skill 匯入匯出**：`skill:export` + `skill:import` IPC + HarnessView 匯入匯出 Modal
- **B3 產品診斷**：`/product-diagnosis` Skill（G0 前六大逼問）
- G0 通過：2026-03-26

---

## 未排期 Backlog

> 老闆提出的需求、想法、未來構想統一記錄在此。正式納入開發前須寫入對應 Sprint 提案書經 G0 審核。

### 功能需求

| # | 需求 | 來源 | 優先級 | 備註 |
|---|------|------|--------|------|
| B1 | 踩坑閉環（自動收集 + 14 天提醒） | Phase 10D | P1 | ✅ 已排入 Sprint 9 |
| B2 | 定期審計（月 checklist + 反模式警示） | Phase 10E | P2 | /harness-audit Skill 部分覆蓋 |
| B3 | G0 前置產品診斷（六大逼問） | Phase 11 | P1 | ✅ 已排入 Sprint 9 |
| B4 | Post-Launch SOP（G6 後行銷+數據+反饋） | Phase 11 | P2 | 商業化 |
| B5 | 數據驅動回顧（Sprint 回顧加入商業指標） | Phase 11 | P2 | 商業化 |
| B6 | Runtime Guardrail（TypeScript 引擎攔截） | Phase 12 | P2 | |
| B7 | 持續學習循環（learn→evolve） | Phase 12 | P2 | |
| B8 | 跨專案知識回饋（A 踩坑 → 公司 → 所有新專案） | Phase 12 | P1 | ✅ 已排入 Sprint 9 |
| B9 | **用戶自訂 Skill**（Agent 對話建立 + 管理 GUI） | 老闆 2026-03-25 | **P0** | ✅ 已排入 Sprint 6 |
| B10 | **用戶自訂 Hook**（Agent 對話建立 + 管理 GUI + 觸發紀錄） | 老闆 2026-03-25 | **P0** | ✅ 已排入 Sprint 6 |
| B11 | Skill 匯入/匯出（跨專案分享） | 老闆 2026-03-25 | P1 | ✅ 已排入 Sprint 9 |
| B12 | Hook 觸發紀錄 + 活躍度統計 | 老闆 2026-03-25 | P1 | ✅ 已排入 Sprint 8 |
| B13 | **任務自動追蹤** | 老闆 2026-03-25 | **P0** | ✅ 已排入 Sprint 7（Skill 驅動 + 全狀態追蹤） |
| B14 | Agent Session 內嵌整合（KnowledgeView + HarnessView 共用） | Sprint 6 遺留 | P1 | ✅ 完成 — HarnessView 第 4 Tab「管理員」+ singleton session |
| B15 | **任務檔案驅動工作流** | 老闆 2026-03-26 | P1 | .tasks/ 升級為完整生命週期文件：PM 寫指令 → L1 讀取執行 → L1 寫回紀錄+結果 → GUI 即時顯示全部內容。需升級 /task-dispatch（含指令段）+ /task-status（寫執行紀錄段）+ /task-done（寫結果段）+ TaskDetailPanel（渲染完整 Markdown）。新應用優先採用此模式。 |

### 優化需求

| # | 需求 | 來源 | 優先級 | 備註 |
|---|------|------|--------|------|
| O1 | 效能優化（首屏載入、Session 啟動速度） | 日常使用 | P2 | |
| O2 | 多 Session 檔案衝突預警 | Phase 8B-2 | P2 | |
| O3 | L1/L2 指揮鏈視覺化 | Phase 8C-2 | P3 | |
| O4 | CLAUDE.md 自動審計提醒（>100 行警告） | 06-1 七大原則 | P2 | /harness-audit 已覆蓋 |
| O5 | Hook 協議標準化（exit 2 + stderr + `$CLAUDE_PROJECT_DIR`） | 03-2 Hooks 進階 | P2 | 現行用 stdout JSON + 硬編碼路徑，改為標準 exit code + 環境變數，模板不再需要路徑替換 |
| O6 | Hook 進階類型應用（prompt / agent / http） | 03-2 Hooks 進階 | P2 | G4 知識同步改 prompt 類型（語義判斷）；Stop Validator 可改 agent 類型（多輪修復建議）；http 類型做操作審計 |

### Hook 缺口（Gate 強制機制）— ✅ Sprint 8 全部補齊

| # | Gate | Hook | 狀態 |
|---|------|------|------|
| H1 | G1 | PreToolUse/Edit — g1-design-check.sh | ✅ 完成 |
| H2 | G3 | Stop Hook 擴充 — 測試檔案存在性檢查 | ✅ 完成 |
| H3 | G4 | PostToolUse/Edit — g4-knowledge-check.sh | ✅ 完成 |
| H4 | G5 | PreToolUse/Bash — g5-pre-deploy.sh | ✅ 完成 |

> Hook 覆蓋：G1（設計稿）+ G2（forbidden-commands）+ G3（stop-validator + 測試檢查）+ G4（知識更新）+ G5（pre-deploy）

### 技術債

| # | 項目 | 優先級 | 備註 |
|---|------|--------|------|
| D1 | 子專案模板路徑硬編碼 `C:\agent-hub` → 改用相對路徑 | P1 | ✅ Sprint 8 完成 — 19 處改為 `{{AGENT_HUB_PATH}}` |
| D2 | 現有 4 模板共用規則重複 → Sprint 2.5 解決 | P0 | 已排入 Sprint 2.5 |

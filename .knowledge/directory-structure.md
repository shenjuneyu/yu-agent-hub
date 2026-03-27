# 目錄結構說明

> **版本**: v1.1
> **最後更新**: 2026-03-25

---

## 頂層結構

```
AgentHub/
├── electron/                    # Electron Main Process
├── src/                         # Vue 3 Renderer
├── agents/                      # Agent 定義 (YAML)
├── knowledge/                   # 知識庫（公司級）
├── tests/                       # 單元測試
├── e2e/                         # E2E 測試
├── .knowledge/                  # 專案級技術規範
├── .claude/                     # Claude Code 設定
├── .tasks/                      # 任務獨立資料夾
├── proposal/                    # Sprint 規劃
├── build/                       # 打包資源
├── CLAUDE.md                    # 專案最高規範
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── vitest.config.ts
└── electron-builder.yml
```

## Electron Main Process

```
electron/
├── main.ts                      # App 進入點、視窗建立、事件轉發
├── preload.ts                   # contextBridge 暴露 API（MaestroApi 型別）
├── ipc/                         # IPC Handlers
│   ├── index.ts                 # 統一註冊所有 handler
│   ├── sessions.ts              # Session spawn/stop/list
│   ├── tasks.ts                 # Task CRUD + 狀態機
│   ├── projects.ts              # Project CRUD + 初始化
│   ├── gates.ts                 # Gate 審核流程
│   ├── sprints.ts               # Sprint 生命週期
│   ├── agents.ts                # Agent 列表
│   ├── knowledge.ts             # 知識庫讀取
│   ├── settings.ts              # 使用者設定
│   ├── git.ts                   # Git 操作
│   ├── hooks.ts                 # Hook 管理
│   ├── project-sync.ts          # 專案檔案同步 IPC
│   └── system.ts                # 系統健康、資料夾選擇
├── services/                    # 核心服務（~14 個）
│   ├── session-manager.ts       # 核心：PTY 管理、Session 生命週期
│   ├── database.ts              # sql.js 初始化、migration
│   ├── agent-loader.ts          # Agent YAML 載入
│   ├── prompt-assembler.ts      # System Prompt 組裝
│   ├── event-parser.ts          # Claude 輸出解析
│   ├── event-bus.ts             # 事件發佈/訂閱
│   ├── gate-keeper.ts           # Gate 審核邏輯
│   ├── task-manager.ts          # 任務管理
│   ├── sprint-manager.ts        # Sprint 管理
│   ├── git-manager.ts           # Git 操作封裝
│   ├── knowledge-reader.ts      # 知識庫讀取
│   ├── file-watcher.ts          # 檔案監控
│   ├── audit-logger.ts          # 稽核日誌
│   ├── tray-service.ts          # 系統列圖示
│   ├── hook-manager.ts          # Hook 偵測/產生/寫入
│   ├── markdown-parser.ts       # 解析 .tasks/*.md + dev-plan 第 10 節
│   └── project-sync.ts          # chokidar 監聽 → DB 同步
├── types/                       # 共享型別
│   └── ipc.ts                   # IpcChannels 常數 + 型別定義
└── utils/
    └── skill-generator.ts       # Skill 注入工具
```

## Vue 3 Renderer

```
src/
├── App.vue
├── main.ts
├── router/
│   └── index.ts                 # 8 個路由
├── stores/                      # Pinia（8 個）
│   ├── sessions.ts
│   ├── projects.ts
│   ├── tasks.ts
│   ├── gates.ts
│   ├── agents.ts
│   ├── git.ts
│   ├── settings.ts
│   └── ui.ts
├── views/                       # 頁面（8 個）
│   ├── DashboardView.vue        # 監控：Sprint + 任務 + Gate + Session
│   ├── SessionsView.vue         # 核心：終端互動
│   ├── ProjectsView.vue         # 操作：專案列表 + 建立
│   ├── ProjectDetailView.vue    # 操作：專案詳情
│   ├── TaskBoardView.vue        # Sprint 3：任務看板（Kanban）
│   ├── GatesView.vue            # Sprint 3：Gate 紀錄時間線
│   ├── AgentsView.vue           # Sprint 3：Agent 團隊清單
│   └── SettingsView.vue         # 設定
├── components/
│   ├── common/                  # 通用元件
│   │   ├── BaseButton.vue
│   │   ├── BaseCard.vue
│   │   ├── BaseModal.vue
│   │   ├── BaseTag.vue
│   │   ├── BaseToggle.vue
│   │   ├── ErrorToast.vue
│   │   ├── ProgressBar.vue
│   │   ├── StatCard.vue
│   │   ├── StatusDot.vue
│   │   ├── ToastContainer.vue
│   │   └── VirtualList.vue
│   ├── session/                 # Session 相關
│   │   ├── SessionCard.vue
│   │   ├── SessionGrid.vue
│   │   ├── SessionLauncher.vue
│   │   ├── SessionTerminal.vue
│   │   └── SidePanel.vue
│   ├── gate/                    # Gate 相關
│   │   ├── GateChecklistPanel.vue
│   │   ├── GatePipeline.vue
│   │   └── GateReviewBanner.vue
│   ├── project/                 # 專案相關
│   │   ├── ProjectCard.vue
│   │   └── ProjectCreateModal.vue
│   ├── agent/                   # Agent 相關
│   │   └── AgentCard.vue
│   └── layout/                  # 佈局
│       ├── SidebarNav.vue
│       └── TopBar.vue
├── composables/
│   └── useIpc.ts                # IPC wrapper（三方一致第 3 點）
└── assets/
    └── main.css                 # TailwindCSS 4 入口
```

## 知識庫與規劃

```
knowledge/                       # 公司級知識庫（部署到子專案）
└── company/
    ├── sop/                     # 標準作業程序
    ├── standards/               # 編碼/API/安全標準
    ├── templates/               # 提案書/計畫書/Review 範本
    ├── project-templates/       # 專案類型模板（web-app/api-service/...）
    └── skill-templates/         # Sprint 2 新增：Skill 模板

.knowledge/                      # 專案級規範（本專案自用）
├── project-overview.md
├── architecture.md
├── directory-structure.md       # 本文件
├── coding-standards.md
├── testing-standards.md
├── quality-checklist.md
├── postmortem-log.md
└── company/                     # 公司規範本地副本
    ├── sop/
    ├── standards/
    └── templates/

proposal/                        # Sprint 規劃
├── sprint1-proposal.md
├── sprint1-dev-plan.md
└── product-roadmap-draft.md

.tasks/                          # 任務獨立資料夾
└── T1-xxx.md                    # 每個任務一個 .md 檔
```

## Agent 定義

```
agents/
└── definitions/                 # Agent 角色定義（YAML）
    ├── product/                 # 產品部門
    ├── engineering/             # 工程部門
    ├── design/                  # 設計部門
    ├── testing/                 # 測試部門
    ├── marketing/               # 行銷部門
    ├── project-management/      # 專案管理部門
    ├── studio-operations/       # 營運部門
    └── bonus/                   # 特殊角色
```

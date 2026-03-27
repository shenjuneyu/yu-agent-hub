# 移除 8 個頁面 + 元件 + 修正路由導覽

| 欄位 | 值 |
|------|-----|
| ID | T6 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

### 刪除頁面
1. src/views/AgentDetailView.vue
2. src/views/AgentsView.vue
3. src/views/CostsView.vue
4. src/views/GatesView.vue
5. src/views/GuideView.vue
6. src/views/KnowledgeView.vue
7. src/views/TaskBoardView.vue
8. src/views/TaskDetailView.vue

### 刪除元件
- src/components/cost/*（BudgetCard, CostBarChart）
- src/components/diff/*（DiffViewer）
- src/components/objection/*（ObjectionList）
- src/components/knowledge/*（FileTree, MarkdownViewer）
- src/components/task/*（KanbanColumn, TaskCard, TaskDetailPanel）
- src/components/common/UpdateBanner.vue
- src/components/common/UserAvatar.vue
- src/components/common/CommandPalette.vue

### 修改
- **src/router/index.ts** — 移除被砍頁面的路由
- **src/components/layout/SidebarNav.vue** — 移除被砍頁面的導覽項目

## 驗收標準

- [ ] 8 個頁面檔案已刪除
- [ ] 相關元件已刪除
- [ ] 路由只剩 5 個：Dashboard, Sessions, Projects, ProjectDetail, Settings
- [ ] SidebarNav 導覽項目正確

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

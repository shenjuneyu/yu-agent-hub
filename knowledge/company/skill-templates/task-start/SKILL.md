---
name: task-start
description: Mark a task as in_progress when agent begins working
disable-model-invocation: true
allowed-tools: Read, Edit, Glob
---

# 任務開始

Agent 開始執行任務時呼叫，將狀態從 `assigned` 改為 `in_progress`。

## 使用方式
```
/task-start <task-id>
```

## 參數
- `$0`: 任務 ID（如 `T5`）

## 執行步驟

1. 找到對應的任務檔案（支援 Sprint 子目錄）：
!`find .tasks -name "$0-*" -o -name "$0.*" 2>/dev/null | head -1`

> 任務檔案可能在 `.tasks/sprint-{N}/T5-xxx.md`，不再只在 `.tasks/` 根目錄。

2. 更新找到的任務檔案：
   - 將 `| 狀態 | ... |` 改為 `| 狀態 | in_progress |`
   - 在 `## 事件紀錄` 區塊底部 append：
   ```
   ### {ISO timestamp} — 狀態變更 → in_progress
   開始執行任務
   ```

3. 輸出確認：
```
▶️ $0 狀態已更新為 in_progress
```

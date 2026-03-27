---
name: task-done
description: Mark a task as in_review (pending L1 review) and record in dev plan section 10
disable-model-invocation: true
allowed-tools: Read, Edit, Glob
---

# 任務完成提交

更新任務狀態為 `in_review`（待 L1 審查），並在開發計畫書第 10 節記錄。

## 使用方式
```
/task-done <task-id> [備註]
```

## 參數
- `$0`: 任務 ID（如 `T1`）
- `$ARGUMENTS`: 完整參數（含備註）

## 格式規範（系統解析依賴，務必遵守）

### .tasks/ 狀態欄位（第 2 欄 `| 狀態 | xxx |`）
必須使用以下英文值：

| 狀態值 | 說明 |
|--------|------|
| `in_review` | 待 L1 審查 |

### dev-plan 第 10 節「結果」欄位（第 3 欄）

| 結果值 | 對應系統狀態 | 說明 |
|--------|-------------|------|
| `🔍 待審查` | in_review | 已提交，待 L1 Review |
| `🔧 需修正` | in_review | 需返工 |

> 系統解析器 `normalizeStatus()` 依賴 `完成/✅/修正/🔧` 等關鍵字判斷。

### 日期欄位（第 2 欄）
格式：`YYYY-MM-DD`

## 執行步驟

1. 找到對應的任務檔案（支援 Sprint 子目錄）：
!`find .tasks -name "$0-*" -o -name "$0.*" 2>/dev/null | head -1`

> 任務檔案可能在 `.tasks/sprint-{N}/T1-xxx.md`，不再只在 `.tasks/` 根目錄。

2. 更新找到的任務檔案：
   - 將 `| 狀態 | ... |` 改為 `| 狀態 | in_review |`
   - 在 `## 事件紀錄` 區塊底部 append：
   ```
   ### {ISO timestamp} — 狀態變更 → in_review
   {備註}
   ```

3. 找到當前 dev-plan：
!`ls -t proposal/sprint*-dev-plan.md 2>/dev/null | head -1`

4. 在 dev-plan 第 10 節「任務完成紀錄」表格，找到對應任務行並更新：
```
| $0 | {YYYY-MM-DD} | 🔍 待審查 | {備註} |
```

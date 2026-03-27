# 移除 6 個 IPC handler + 清理 preload/types/useIpc

| 欄位 | 值 |
|------|-----|
| ID | T4 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

### 刪除 IPC handler 檔案
1. electron/ipc/sync.ts（12 通道）
2. electron/ipc/doc-sync.ts（7 通道）
3. electron/ipc/auth.ts（4 通道）
4. electron/ipc/browse.ts（3 通道）
5. electron/ipc/costs.ts（4 通道）
6. electron/ipc/objections.ts（2 通道）

### 同步修改（IPC 三方一致）
1. **electron/types/ipc.ts** — 移除對應的 IpcChannels 常數
2. **electron/preload.ts** — 移除 contextBridge 中對應的 API 暴露
3. **src/composables/useIpc.ts** — 移除對應的 wrapper 函數
4. **electron/ipc/index.ts** — 移除被砍 handler 的 register 呼叫

## 驗收標準

- [ ] 6 個 IPC handler 檔案已刪除
- [ ] ipc.ts / preload.ts / useIpc.ts 三方已同步清理
- [ ] ipc/index.ts 已更新

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

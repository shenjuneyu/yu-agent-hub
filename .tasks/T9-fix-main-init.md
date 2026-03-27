# 修正 main.ts 初始化流程

| 欄位 | 值 |
|------|-----|
| ID | T9 |
| 專案 | AgentHub |
| Sprint | sprint1 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 建立時間 | 2026-03-24T20:00:00.000Z |

---

## 任務描述

修正 electron/main.ts 的初始化流程，移除被砍服務的 initialize/destroy 呼叫：

移除：
- crashReporter.initialize()
- notificationService.initialize()
- shortcutService.initialize()/destroy()
- syncScheduler 相關
- browseServer 相關

保留：
- database.initialize()
- agentLoader.load()
- sessionManager.detectClaude()
- registerAllHandlers()（已在 T4 清理）
- createWindow()
- setupEventForwarding()
- trayService.initialize()/destroy()
- fileWatcher.start()/stop()
- sessionManager.cleanup()
- database.close()

## 驗收標準

- [ ] main.ts 無引用到已刪除服務
- [ ] 應用啟動流程正常
- [ ] 應用關閉流程正常（無 crash）

---

## 事件紀錄

### 2026-03-24 20:00 — 建立任務
由 PM 建立

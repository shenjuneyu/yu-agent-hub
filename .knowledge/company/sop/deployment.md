# 部署 SOP

> **版本**: v3.0
> **最後更新**: 2026-03-09

---

## 概述

部署流程對應 Gate G4（部署就緒）和 G5（正式發佈）。

## 環境

| 環境 | 用途 | 部署方式 |
|-----|------|---------|
| 開發 (dev) | 開發中測試 | 自動 |
| 測試 (staging) | QA 驗證 | 手動觸發 |
| 正式 (production) | 用戶使用 | 老闆 Go/NoGo (G4→G5) |

## Docker 多階段建置規範

```dockerfile
# Stage 1: builder
FROM node:20-alpine AS builder
# 安裝系統依賴（如 openssl for Prisma）
RUN apk add --no-cache openssl

# Stage 2: runner
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
RUN addgroup -g 1001 appuser && adduser -u 1001 -G appuser -s /bin/sh -D appuser
USER appuser
```

### Prisma 部署注意事項

| 步驟 | 說明 |
|------|------|
| 1. generate | 在 builder 階段執行 `prisma generate`，產生 client |
| 2. COPY client | 將 `.prisma/client` 從 builder COPY 到 runner |
| 3. migrate | 部署時執行 `prisma migrate deploy`（不是 `dev`） |
| 4. 共用 tsconfig | Dockerfile 必須 COPY `tsconfig.base.json`（若 server tsconfig extends 它） |

### 前端環境變數

- `VITE_` 開頭的變數在 **build 時** 注入，不是 runtime
- CI/CD 必須從 GitHub Secrets 注入，不能依賴 .env 檔
- 確認 `VITE_API_BASE_URL` 包含完整路徑（如 `/api/v1`）

## CI/CD 規則

1. **CI 必須通過才能觸發 CD**: Lint → Type Check → Test 全綠才部署
2. **單一 Job 架構**: 避免多 Job 間的 artifact 傳遞問題
3. **docker-compose.prod.yml**: image 名稱硬編碼，不用環境變數 fallback
4. **SSH 部署**: Ed25519 金鑰，部署後清理

## Pre-Deploy Checklist

部署前逐項確認，任一項未完成則不得觸發部署：

### 程式碼準備

- [ ] CI/CD 管線通過（Lint → Type Check → Test 全綠）
- [ ] Code Review 通過（L1 內部 Review + Gate G1）
- [ ] 無 `console.log` / `debugger` 殘留
- [ ] 所有 TODO 已處理或標記為 known issue

### 資料庫

- [ ] DB Migration 已測試（staging 環境跑過）
- [ ] Migration 可逆（有對應 down migration）
- [ ] 無破壞性 Schema 變更（或有資料遷移腳本）
- [ ] 索引已優化（大表查詢確認 EXPLAIN）

### 環境配置

- [ ] 環境變數已在目標環境設定（GitHub Secrets / .env.production）
- [ ] `VITE_` 開頭變數確認含完整路徑
- [ ] DNS / SSL 配置正確
- [ ] 第三方服務 API Key 已更新（如有變更）

### Feature Flags（如適用）

- [ ] 新功能 flag 預設為 off
- [ ] 舊功能 flag 確認可安全移除

## G4 — 部署就緒

Checklist：
- [ ] Pre-Deploy Checklist 全部通過
- [ ] Docker image 建置成功
- [ ] 回滾計畫已準備
- [ ] 監控已設定
- [ ] 通知相關人員部署時間

通過條件：所有 Checklist 項目確認完成。

## G5 — 正式發佈

Checklist：
- [ ] 安全審核通過
- [ ] 上線前最終確認
- [ ] 用戶文件已完成
- [ ] 正式核准發佈

通過條件：老闆最終確認，核准上線。

## 正式環境部署流程

1. QA 確認所有測試通過
2. DevOps 準備部署計畫
3. Tech Lead 確認程式碼穩定
4. PM 提交上線申請 → G4 審核
5. 老闆 Go/NoGo 決策
6. DevOps 執行部署
7. Health Check 等待（最多 60 秒，12 x 5s 重試）
8. 監控 30 分鐘確認穩定
9. 老闆最終確認 → G5 審核

## Post-Deploy Verification

部署完成後立即執行：

### 自動驗證

- [ ] Health Check 通過（最多 60 秒，12 x 5s 重試）
- [ ] 所有 API 端點回應 200（smoke test）
- [ ] 前端頁面正常載入（無白屏、無 JS 錯誤）
- [ ] WebSocket 連線正常（如適用）

### 手動驗證（部署後 30 分鐘內）

- [ ] 核心功能手動操作一輪
- [ ] 監控面板無異常告警
- [ ] 錯誤日誌無新增 ERROR
- [ ] 資料庫連線正常、查詢效能穩定

### 穩定觀察（部署後 30 分鐘）

- [ ] 無記憶體洩漏跡象
- [ ] 回應時間穩定
- [ ] 無使用者回報問題

## 回滾

如果部署後發現問題：
1. DevOps 立即回滾到上一版本
2. 通知所有相關人員
3. Tech Lead 組織排查

## Hotfix 緊急部署流程

用於修復已上線的重大 Bug，跳過一般 Sprint 流程：

### 流程

```
發現問題 → 老闆確認嚴重度 → 指派 L1/L2
→ 修復 → 最小範圍測試 → 老闆 Go/NoGo → 部署
→ Post-Deploy Verification → 補寫文件/測試
```

### 規則

1. **範圍最小化**：只修復問題本身，不附帶其他改動
2. **獨立分支**：從 production tag 切 `hotfix/*` 分支
3. **必須測試**：至少跑過影響範圍的單元測試
4. **補齊文件**：Hotfix 部署後 24 小時內補寫：
   - 踩坑紀錄（postmortem）
   - 開發紀錄
   - 對應的完整測試案例
5. **回顧**：Hotfix 完成後回顧根因，評估是否需要流程改善

## 生產環境操作注意

- 執行 psql 前必須先驗證 `POSTGRES_*` 環境變數
- 帳號建立：用 bcryptjs hash 密碼，透過 psql 插入
- Docker 日誌限制：`max-size: 20m`, `max-file: 5`
- Healthcheck：使用 `node -e "fetch('...')"` 而非 wget/curl（Alpine 不一定有）
- 非 root 運行：建立專用使用者（uid: 1001）

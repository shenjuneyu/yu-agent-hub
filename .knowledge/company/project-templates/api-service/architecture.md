# API Service 架構參考

> PM 參考此文件，根據專案需求調整後放入 `{workDir}/.knowledge/`
> 本文件參考 fin-shark-platform 的實戰經驗，提煉為通用原則。

---

## 分層架構

### 推薦模式：簡化 Clean Architecture

```
API 層 → 應用層 → 領域層 ← 基礎設施層
```

| 層 | 職責 | 規則 |
|----|------|------|
| API 層 | HTTP 請求處理、參數驗證 | 不含業務邏輯 |
| 應用層 | 編排領域服務、管理交易 | 一個方法對應一個 Use Case |
| 領域層 | 純業務邏輯 | 不依賴任何框架 |
| 基礎設施層 | 實作介面、資料庫、外部呼叫 | 所有框架依賴在這裡 |

### 目錄建議（以 Java Spring Boot 為例）

```
src/main/java/com/example/{service}/
├── api/
│   ├── controller/       # REST Controller
│   ├── request/          # 請求 DTO
│   └── response/         # 回應 DTO
├── application/
│   ├── service/          # 應用服務（Use Case）
│   └── assembler/        # 物件轉換
├── domain/
│   ├── model/            # 領域模型（純業務物件）
│   ├── service/          # 領域服務
│   └── repository/       # Repository 介面
├── infrastructure/
│   ├── persistence/      # JPA Entity + Repository 實作
│   ├── messaging/        # MQ 發送/消費
│   ├── client/           # 外部 API 呼叫
│   └── config/           # 框架設定
└── shared/
    ├── constant/
    ├── enums/
    └── exception/
```

### 目錄建議（以 Python FastAPI 為例）

```
app/
├── api/
│   └── routes/           # 路由定義
├── core/
│   ├── config.py         # 設定
│   └── security.py       # 認證
├── models/               # 資料模型（SQLAlchemy / Pydantic）
├── services/             # 業務邏輯
├── repositories/         # 資料存取
└── schemas/              # 請求/回應 Schema
```

## API 設計原則

- 統一回應格式：`{ code, message, data, timestamp, trace_id }`
- 錯誤碼分類：`{PREFIX}_{NNN}`（如 AUTH_001, ORDER_001）
- 分頁：`{ content, page, size, total_elements, total_pages }`
- 版本：URL 路徑 `/api/v{major}/...`
- 命名：URL kebab-case、欄位 snake_case

## 資料庫設計原則

- 表名: snake_case, 複數形式
- 標準欄位: `id`, `created_at`, `updated_at`, `is_deleted`, `version`
- 主鍵: BIGINT / BIGSERIAL
- 金額: DECIMAL(15,2)
- 時間: TIMESTAMPTZ
- 索引命名: `idx_{table}_{column}`
- 使用 Migration 工具管理 Schema（Flyway / Alembic / Knex）

## 事件/訊息設計（如有 MQ）

- Exchange 命名: `{domain}.topic`
- Queue 命名: `{consumer-service}.{domain}.queue`
- Routing Key: `{domain}.{action}.{detail}`
- 訊息格式: `{ event_id, event_type, timestamp, source, version, data }`
- 消費者實作冪等性（用 event_id 去重）

## 韌性設計

- 外部呼叫設逾時（HTTP 3-5s, 外部 API 10s, DB 20-30s）
- 重試策略：3 次，間隔 1s / 5s / 30s
- 並發更新用樂觀鎖（`@Version` / version 欄位）
- 關鍵寫入操作包在交易中

## 可觀測性

- 結構化日誌（JSON 格式）
- 請求追蹤（trace_id 貫穿整個請求鏈）
- 健康檢查端點（`/health` 或 `/actuator/health`）
- Metrics 暴露（Prometheus / OpenTelemetry）

## 測試策略

| 層級 | 工具建議 | 覆蓋目標 |
|------|---------|---------|
| 單元測試 | JUnit / Pytest | Service 層 >= 80% |
| 整合測試 | TestContainers / test DB | Repository + API |
| API 測試 | MockMvc / httpx | 所有端點 |

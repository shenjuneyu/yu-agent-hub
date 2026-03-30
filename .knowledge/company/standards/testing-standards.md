# 測試規範

> **版本**: v3.0
> **最後更新**: 2026-03-09

---

## 測試層級

| 層級 | 負責人 | 時機 | 對應 Gate |
|-----|--------|------|----------|
| 單元測試 | 開發工程師 | 開發時 | G3 |
| 整合測試 | 測試工程師 | 功能完成後 | G3 |
| 端對端測試 | 測試工程師 | Sprint 結束前 | G3 |
| 效能測試 | 測試工程師 | 上線前 | G3 |

## 覆蓋率要求

- 核心業務邏輯: >= 80%
- API 端點: 100%（至少 happy path）
- 工具類: >= 70%

## 命名規範

### TypeScript (Vitest / Playwright)

```typescript
// 單元測試：describe + it 描述行為
describe('OrderService', () => {
  it('creates order with valid data and returns 201', () => { ... });
  it('rejects order with duplicate email and returns 409', () => { ... });
});

// E2E：描述用戶操作流程
test('customer can browse menu and add item to cart', async () => { ... });
```

### Python (pytest)

```python
def test_create_user_with_valid_data_returns_201():
def test_create_user_with_duplicate_email_returns_409():
```

## 測試環境隔離

> ⚠️ **E2E 測試必須使用獨立的測試資料庫，禁止連接生產或開發資料庫。**

| 項目 | 要求 |
|------|------|
| 資料庫 | 獨立測試 DB 或 Docker 容器，每次測試前 seed |
| API 服務 | 測試專用實例或 mock server |
| 外部服務 | 一律 mock（支付、郵件、第三方 API） |
| 測試資料 | 用 seed script 產生，不依賴手動輸入 |
| 清理策略 | 每個 test suite 前重設資料或用 transaction rollback |

### Playwright 環境配置

```typescript
// playwright.config.ts — 開發環境
use: { baseURL: 'http://localhost:5173' }

// playwright.prod.config.ts — 生產環境（獨立配置，謹慎使用）
use: { baseURL: 'https://app.example.com' }
```

## 測試程式碼不進生產

`.dockerignore` 必須排除：
- `__tests__/`
- `*.test.*`
- `*.spec.*`
- `e2e/`
- `playwright.config.ts`

## 與 Gate G3 的關係

Gate G3（測試驗證）Checklist：
- [ ] 單元測試通過
- [ ] 整合測試通過
- [ ] E2E 測試通過
- [ ] 效能測試通過（若有）
- [ ] 無重大 Bug

G3 通過條件：測試覆蓋率達標，無 Critical/High 等級 Bug。

## Bug 報告格式

使用 `templates/bug-report.md` 模板，必須包含：
1. 重現步驟
2. 預期行為
3. 實際行為
4. 環境資訊

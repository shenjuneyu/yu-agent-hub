# 安全規範

> **版本**: v3.0
> **最後更新**: 2026-03-09

---

## 絕對禁止

1. **硬編碼機密資訊** — 密碼、API Key、Token 不能出現在程式碼中
2. **提交 .env 檔案** — .gitignore 必須排除
3. **關閉 HTTPS** — 正式環境必須 HTTPS
4. **使用 `ddl-auto: create`** — 正式環境禁用自動 DDL
5. **CORS 允許全部來源** — `allowedOrigins` 禁止 `"*"`，必須明確列出白名單

## 必須做到

1. **輸入驗證** — 所有外部輸入必須驗證（前端 + 後端雙重驗證）
2. **SQL 參數化** — 禁止字串拼接 SQL，一律用參數化查詢或 ORM
3. **認證授權** — API 必須有認證機制，端點權限明確定義
4. **逾時設定** — 外部呼叫必須設逾時（HTTP 3-5s, 外部 API 10s, DB 20-30s）
5. **日誌脫敏** — 日誌不可記錄密碼、Token、個人隱私資料
6. **CORS 限制** — `allowedHeaders` 必須明確列出，origin 限定信任域名

## JWT 最佳實踐

| 項目 | 建議值 | 說明 |
|------|--------|------|
| Access Token 有效期 | 15 分鐘 | 短效期降低洩露風險 |
| Refresh Token 有效期 | 30 天 | httpOnly cookie 儲存，不放 localStorage |
| 簽章演算法 | HS256 或 RS256 | 依場景選擇對稱/非對稱 |
| Token 儲存（前端） | Memory / httpOnly cookie | **禁止放 localStorage** |
| Refresh 機制 | Silent refresh | Access 過期時自動用 Refresh Token 換新 |

## 多租戶安全

- 所有業務表必須有 `tenant_id`（如 `shop_id`）欄位做行級隔離
- 使用 ORM middleware 自動注入租戶篩選條件，禁止手動拼接
- API 層透過認證 middleware 解析當前租戶，不信任前端傳入的 tenant_id
- 公開路由（無認證）使用 URL slug 解析租戶，middleware 負責 slug → id 轉換

## 機密管理

| 環境 | 方式 |
|------|------|
| 開發環境 | .env 檔案（不提交） |
| CI/CD | GitHub Secrets / CI 環境變數 |
| 正式環境 | 環境變數 / Secret Manager |

## 安全審核（對應 G5）

G5 安全審核 Checklist：
- [ ] 無硬編碼機密
- [ ] 認證機制完整
- [ ] 輸入驗證完整
- [ ] 無已知安全漏洞
- [ ] CORS 白名單正確
- [ ] JWT 設定符合上述最佳實踐
- [ ] 多租戶隔離驗證通過

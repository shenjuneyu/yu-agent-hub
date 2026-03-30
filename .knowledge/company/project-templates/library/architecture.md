# Library / Package 架構參考

> PM 參考此文件，根據專案需求調整後放入 `{workDir}/.knowledge/`

---

## 設計原則

1. **最小 API 表面** — 只暴露必要的公開介面
2. **零/少相依** — 減少外部依賴，降低供應鏈風險
3. **型別安全** — 提供完整的型別定義
4. **向後相容** — SemVer 版本管理，Breaking change 只在 Major 版本
5. **Tree-shakeable** — ESM 輸出，支援 tree-shaking

## 目錄建議（TypeScript）

```
{package-name}/
├── src/
│   ├── index.ts          # 公開 API 入口
│   ├── core/             # 核心邏輯
│   ├── utils/            # 內部工具
│   └── types.ts          # 型別定義
├── tests/
│   ├── unit/             # 單元測試
│   └── integration/      # 整合測試
├── package.json
├── tsconfig.json
├── tsup.config.ts        # 建構設定
├── vitest.config.ts      # 測試設定
├── README.md             # 使用文件
├── CHANGELOG.md          # 變更紀錄
└── LICENSE
```

## 目錄建議（Python）

```
{package_name}/
├── src/
│   └── {package_name}/
│       ├── __init__.py   # 公開 API
│       ├── core.py       # 核心邏輯
│       └── types.py      # 型別定義
├── tests/
├── pyproject.toml
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## 建構與發佈

### TypeScript (npm)

- 建構: tsup（同時輸出 ESM + CJS）
- 型別: 自動產生 `.d.ts`
- 發佈: `npm publish`（需先 `npm login`）
- package.json 必要欄位: `main`, `module`, `types`, `exports`

### Python (PyPI)

- 建構: `python -m build`
- 發佈: `twine upload dist/*`
- pyproject.toml 必要欄位: `name`, `version`, `requires-python`

## 版本管理

- **SemVer**: `MAJOR.MINOR.PATCH`
  - MAJOR: 不相容的 API 變更
  - MINOR: 向後相容的新功能
  - PATCH: 向後相容的 Bug 修復
- 維護 `CHANGELOG.md`，每次發佈記錄變更

## 測試策略

| 層級 | 覆蓋目標 | 說明 |
|------|---------|------|
| 單元測試 | >= 90% | 所有公開 API |
| 邊界測試 | 完整 | 錯誤輸入、極端情況 |
| 相容性測試 | 主要版本 | 測試支援的最低版本 |

## 文件

- README.md: 安裝、快速開始、基本用法
- API 文件: 自動從型別/docstring 產生（TypeDoc / Sphinx）
- 範例: `examples/` 目錄放使用範例

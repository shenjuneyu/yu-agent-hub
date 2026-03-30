# 專案啟動 SOP

> **版本**: v2.0
> **最後更新**: 2026-03-03

---

## 概述

專案啟動流程對應 Gate G0（需求確認）和 G1（設計審核）。由老闆提出想法，PM 負責整理需求並與老闆確認。

## 流程

### 第一步：老闆提出想法

- 老闆描述想做什麼、目標用戶、核心價值
- 在 Maestro 中建立新專案，選擇專案類型（web-app / api-service / mobile-app / library）
- 指定工作目錄（workDir）

### 第二步：PM 規劃 Sprint

- 建立第一個 Sprint（通常選 `full` 類型，走完整流程）
- PM 啟動 Session，與老闆討論以下內容：
  - 目標用戶與核心價值
  - 核心功能列表（P0 / P1 / P2）
  - 範圍界定（做什麼、不做什麼）
  - 技術方向與風險

### 第三步：產出專案規範（G0 前）

PM 根據討論結果，參考知識庫中對應專案類型的模板：
- `knowledge/company/project-templates/{type}/` 目錄
- 產出專案專屬的 `{workDir}/CLAUDE.md`（開發規範）
- 產出專案專屬的 `{workDir}/.knowledge/`（技術規範文件）

### 第四步：通過 G0 — 需求確認

Gate G0 Checklist：
- [ ] 需求文件已建立
- [ ] 用戶故事已定義
- [ ] 驗收標準已明確
- [ ] 技術可行性已確認

### 第五步：設計審核（如 Sprint 類型包含 G1）

PM 與 Tech Lead 完成技術設計後，通過 G1：
- [ ] UI/UX 設計已完成
- [ ] 架構設計已審核
- [ ] API 規格已定義
- [ ] 資料模型已確認

### 第六步：進入開發

參照 `sop/sprint-planning.md` 進入 Sprint 開發階段。

## 產出物

| 產出物 | 位置 | 負責人 |
|--------|------|--------|
| 專案規範 | `{workDir}/CLAUDE.md` | PM |
| 技術規範 | `{workDir}/.knowledge/` | PM + Tech Lead |
| Gate G0 審核紀錄 | `{workDir}/.reviews/` | 自動產生 |

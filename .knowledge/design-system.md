# AgentHub 設計規範 (Design System)

> **版本**: v1.0
> **最後更新**: 2026-03-25
> **負責人**: Design Director

---

## 1. 設計原則

| # | 原則 | 說明 |
|---|------|------|
| 1 | **監控優先** | Dashboard 像駕駛艙，一眼掌握全局狀態 |
| 2 | **終端為王** | Sessions 頁面終端區域最大化，終端是核心操作介面 |
| 3 | **暗色沉浸** | 暗色系為主，搭配終端風格，減少視覺疲勞 |
| 4 | **狀態鮮明** | 用色彩區分任務/Gate/Session 狀態，一看即懂 |
| 5 | **高密度適中** | 資訊密度介於極簡和擁擠之間，一人用不需留白過多 |
| 6 | **效率至上** | 減少點擊步驟，高頻操作放在最容易觸及的位置 |

---

## 2. 色彩系統

### 2.1 背景層次（Dark Theme，預設）

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-bg-primary` | `#0f1117` | 頁面底層背景 |
| `--color-bg-secondary` | `#161822` | Sidebar、次級面板 |
| `--color-bg-card` | `#1c1e2e` | 卡片、容器 |
| `--color-bg-hover` | `#252840` | 懸停狀態 |
| `--color-bg-active` | `#2a2d45` | 選中/按壓狀態 |

### 2.2 邊框

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-border-default` | `#2e3148` | 預設邊框 |
| `--color-border-light` | `#3a3d56` | 懸停邊框 |

### 2.3 文字

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-text-primary` | `#e4e4f0` | 主要文字 |
| `--color-text-secondary` | `#8b8da3` | 次要文字 |
| `--color-text-muted` | `#5c5e72` | 輔助/禁用文字 |

### 2.4 品牌色 (Accent)

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-accent` | `#6c5ce7` | 主品牌色、Primary 按鈕、選中狀態 |
| `--color-accent-light` | `#a29bfe` | 連結、hover 強調 |

> 品牌漸層：`linear-gradient(135deg, #6c5ce7, #22d3ee)` 用於 Logo 和特殊強調。

### 2.5 語義色

| Token | 色值 | 用途 | 半透明背景 |
|-------|------|------|-----------|
| `--color-success` | `#00d68f` | 完成、通過、運行中 | `#00d68f33` |
| `--color-warning` | `#ffaa00` | 進行中、待處理、注意 | `#ffaa0033` |
| `--color-danger` | `#ff6b6b` | 失敗、退回、緊急 | `#ff6b6b33` |
| `--color-info` | `#339af0` | 已提交、已分配、資訊 | `#339af033` |

### 2.6 裝飾色

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-cyan` | `#22d3ee` | 特殊標記 |
| `--color-orange` | `#ff922b` | 高優先級 |
| `--color-pink` | `#f06595` | 裝飾 |

### 2.7 Light Theme Override

亮色主題透過 `[data-theme="light"]` CSS 變數覆蓋實現，保持相同的 token 名稱，僅調整色值。亮色模式下品牌色不變，語義色略加深以確保對比度。

---

## 3. 字體排版

### 3.1 字體家族

```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

終端區域使用系統等寬字體：
```
font-family: 'Cascadia Code', 'Consolas', 'Monaco', monospace;
```

### 3.2 字級系統

| 名稱 | 大小 | 行高 | 字重 | 用途 |
|------|------|------|------|------|
| **Display** | 28px | 1.2 | Bold (700) | StatCard 數字 |
| **Title** | 20px | 1.3 | Semibold (600) | 頁面標題 |
| **Subtitle** | 16px | 1.4 | Semibold (600) | 品牌名稱 |
| **Body** | 14px | 1.5 | Regular (400) | 主要內容 |
| **Body-sm** | 13px | 1.5 | Medium (500) | 按鈕文字、表格內容 |
| **Caption** | 12px | 1.4 | Regular (400) | 輔助說明 |
| **Caption-sm** | 11px | 1.4 | Medium (500) | Tag 文字、Badge |
| **Micro** | 10px | 1.3 | Medium (500) | 版本號、最小標記 |

---

## 4. 間距系統

採用 4px 為基礎單位，使用 TailwindCSS 預設 spacing scale：

| Token | 值 | 用途 |
|-------|----|------|
| `0.5` | 2px | 極小間距（icon gap） |
| `1` | 4px | 緊密間距 |
| `1.5` | 6px | Tag padding |
| `2` | 8px | 卡片內元素間距 |
| `2.5` | 10px | 按鈕 padding-y |
| `3` | 12px | 卡片內部 padding |
| `4` | 16px | 區塊間距、容器 padding |
| `5` | 20px | 大卡片 padding |
| `6` | 24px | 頁面邊距（main padding） |

---

## 5. 圓角系統

| 用途 | 圓角 | TailwindCSS |
|------|------|-------------|
| 按鈕、Tag | 8px | `rounded-lg` |
| 卡片、面板 | 12px | `rounded-xl` |
| 進度條、Badge | 9999px | `rounded-full` |
| 小元素 | 4px | `rounded` |
| 狀態點 | 50% | `rounded-full` |

---

## 6. 陰影系統

| 用途 | 陰影 |
|------|------|
| 卡片預設 | 無（用邊框替代） |
| Sidebar 展開 | `4px 0 24px rgba(0, 0, 0, 0.4)` |
| Modal 背景 | `bg-black/60` 遮罩 |
| 懸停強調 | `0 0 12px rgba(108, 92, 231, 0.1)` accent glow |

> 暗色主題下陰影效果較弱，主要依靠邊框和背景色差來建立層次。

---

## 7. 動畫

| 名稱 | 定義 | 用途 |
|------|------|------|
| `pulse-glow` | `2s ease-in-out infinite` opacity 1→0.4→1 | 載入中狀態 |
| `pulse-fast` | `1.5s ease-in-out infinite` | 強調提示 |
| `blink` | `1s infinite` opacity 1→0→1 | 終端游標 |
| `spin` | TailwindCSS `animate-spin` | 載入 spinner |
| transition | `150ms ease` | 所有互動元素預設過渡 |
| sidebar | `200ms ease` | Sidebar 展開/收合 |

---

## 8. 元件規範

### 8.1 Button (BaseButton)

| Variant | 背景 | 文字色 | 用途 |
|---------|------|--------|------|
| `primary` | accent | white | 主操作（新增、儲存） |
| `secondary` | bg-hover + border | text-primary | 次要操作 |
| `ghost` | transparent | text-secondary | 低優先操作 |
| `icon` | transparent + border | text-secondary | 圖示按鈕 |
| `success` | success | white | 確認操作 |
| `danger` | danger | white | 危險操作（刪除） |

**Size**: `default`（px-4 py-2 text-13px）/ `sm`（px-2.5 py-5px text-12px）

### 8.2 Card (BaseCard)

- 圓角 `rounded-xl`
- 邊框 `border border-border-default`
- 背景 `bg-bg-card`
- Padding `p-5`
- 可選標題 header slot

### 8.3 Tag (BaseTag)

8 種色彩變體：`purple` / `green` / `yellow` / `red` / `blue` / `cyan` / `orange` / `pink`

每種色彩使用半透明背景 + 對應色文字：
```
bg-[color]33 + text-[color]
```

- Size: `px-2.5 py-3px text-11px`
- 圓角: `rounded-md`

### 8.4 StatCard

- 上方標籤（xs, uppercase, tracking-wide, text-muted）
- 中間數字（28px, font-bold）
- 下方變化值（xs, 帶色彩）

### 8.5 StatusDot

4 種狀態視覺：
| 狀態 | 表現 |
|------|------|
| `idle` | 灰點 |
| `thinking` | accent 點 + pulse 動畫 |
| `running` | success 點 |
| `error` | danger 點 |

### 8.6 Modal (BaseModal)

- 背景遮罩：`fixed inset-0 bg-black/60`
- 內容面板：`rounded-xl border bg-bg-secondary p-6`
- 預設寬度：`w-[480px]`
- 點擊遮罩關閉

### 8.7 Select / Input

- `rounded-lg border border-border-default bg-bg-primary`（Input）/ `bg-bg-card`（Select）
- `px-3 py-2 text-sm`
- Focus: `border-accent outline-none`

### 8.8 Toggle (BaseToggle)

- 圓角膠囊形
- Off: `bg-border-default`
- On: `bg-accent`

---

## 9. 佈局系統

### 9.1 整體結構

```
┌─ Sidebar (52px collapsed / 200px expanded) ─┬─ TopBar ──────────────┐
│                                               │                       │
│  Brand Logo                                   │  頁面標題 / 搜尋      │
│  ─────────                                    ├───────────────────────┤
│  📊 儀表板                                    │                       │
│  💻 工作階段 [badge]                           │   Main Content        │
│  ─────────                                    │   padding: 24px       │
│  📁 專案                                      │                       │
│  📋 任務                                      │                       │
│  🚪 關卡                                      │                       │
│  🤖 團隊                                      │                       │
│  📚 知識庫                                    │                       │
│  ─────────                                    │                       │
│  ⚙ 設定                                      │                       │
│                                               │                       │
│  v0.1  [N 執行中]                             │                       │
└───────────────────────────────────────────────┴───────────────────────┘
```

### 9.2 Sidebar 導覽

- **收合狀態**: 52px 寬，只顯示圖示
- **展開狀態**: 200px 寬，hover 觸發，帶 shadow
- **三組分隔**:
  - 高頻：儀表板、工作階段
  - 管理：專案、任務、關卡、團隊、知識庫
  - 系統：設定
- **選中狀態**: 左側 3px accent 邊線 + bg-active + accent-light 文字
- **Badge**: Session 數量（收合時為圓點，展開時為數字）

### 9.3 響應式

- 主要適配: 1920×1080 和 2560×1440
- Sidebar 固定寬度，內容區域填滿剩餘空間
- 卡片網格使用 `auto-fill, minmax(340px, 1fr)`
- TaskBoard Kanban 使用水平捲動

---

## 10. 狀態設計規範

### 10.1 空狀態 (Empty State)

```
┌───────────────────────────────────┐
│                                   │
│        [48px SVG 圖示]            │
│        （opacity: 0.3）           │
│                                   │
│    主要文字 (text-sm)             │
│    次要文字/操作連結              │
│                                   │
└───────────────────────────────────┘
```

- 圖示：相關的 SVG 線稿，opacity 0.3
- 主要文字：`text-sm text-text-muted`
- 操作連結：`text-accent-light hover:underline`

### 10.2 Loading 狀態

- 全頁載入：居中 spinner + "載入中..." 文字
- 局部載入：`animate-pulse` 骨架屏（Skeleton）
- 按鈕載入：按鈕內 spinner 圖示，disabled 狀態

### 10.3 Error 狀態

- Toast 通知：右上角滑入/滑出
- 區塊錯誤：紅色邊框 + 錯誤訊息
- 全頁錯誤：居中圖示 + 錯誤訊息 + 重試按鈕

---

## 11. 狀態色彩映射

### Session 狀態

| 狀態 | 色彩 | 標籤 |
|------|------|------|
| starting | accent + pulse | 啟動中 |
| running | success | 執行中 |
| thinking | info + pulse | 思考中 |
| executing_tool | accent | 執行工具 |
| awaiting_approval | warning | 等待核准 |
| waiting_input | warning | 等待輸入 |
| summarizing | info + pulse | 摘要中 |
| completed | success | 已完成 |
| failed | danger | 失敗 |
| stopped | text-muted | 已停止 |

### Task 狀態

| 狀態 | 色彩 | 標籤 |
|------|------|------|
| created | purple | 待處理 |
| assigned | info | 已分配 |
| in_progress | warning | 進行中 |
| in_review | accent | 審查中 |
| blocked | danger | 阻塞 |
| done | success | 完成 |

### Gate 狀態

| 狀態 | 色彩 | 標籤 |
|------|------|------|
| pending | warning | 待處理 |
| submitted | info | 已提交 |
| approved | success | 已通過 |
| rejected | danger | 已退回 |

### Task 優先級

| 優先級 | 色彩 | 標籤 |
|--------|------|------|
| critical | danger | 緊急 |
| high | warning | 高 |
| medium | info | 中 |
| low | text-muted | 低 |

---

## 12. 圖示規範

### Sidebar 圖示

使用 Unicode 字元而非圖示庫，保持輕量：

| 頁面 | 圖示 | Unicode |
|------|------|---------|
| 儀表板 | ◫ | U+25EB |
| 工作階段 | ▷ | U+25B7 |
| 專案 | ▤ | U+25A4 |
| 任務 | ☰ | U+2630 |
| 關卡 | ◈ | U+25C8 |
| 團隊 | ◉ | U+25C9 |
| 知識庫 | 📚 | Emoji |
| 設定 | ⚙ | U+2699 |

### 狀態圖示

- 成功: ✓ 或 green dot
- 失敗: ✕ 或 red dot
- 進行中: pulse animation dot
- 待處理: yellow dot

---

## 13. 頁面設計概要

### 13.1 Dashboard（儀表板）
- 頂部 4 欄 StatCard（Agent數 / 執行中 / 專案數 / 今日用量）
- 左欄：Sprint 進度 + 待處理任務 + 最近活動
- 右欄：活躍 Session + 審核關卡

### 13.2 Sessions（工作階段）
- 頂部：Tab（執行中/歷史）+ 分組/佈局切換 + 新增按鈕
- 主區域：SessionGrid（list/single/dual/triple 佈局）
- 右側面板：選中 Session 的終端預覽
- 歷史 Tab：VirtualList 高性能列表

### 13.3 Projects（專案列表）
- 網格卡片佈局（auto-fill）
- 每張卡片：名稱、類型、狀態、Sprint 進度、任務統計
- 虛線邊框「新增」卡片

### 13.4 ProjectDetail（專案詳情）
- 專案基本資訊區
- Sprint 列表（含 Gate 進度條）
- 任務統計

### 13.5 TaskBoard（任務看板）
- Kanban 5 欄：待做 / 已分配 / 進行中 / 審查中 / 完成
- 每張卡片：左側優先級色帶 + 標題 + 標籤
- 頂部篩選：專案 + Sprint

### 13.6 Gates（審核關卡）
- 時間線佈局，左側垂直線 + 圓形 Gate 圖示
- 每條紀錄：Gate 類型 Tag + 狀態 Tag + 審核意見
- 篩選：專案 + 狀態

### 13.7 Agents（團隊）
- 按部門分組，可收合
- 3 欄網格卡片
- 每張卡片：圖示 + 名稱 + 等級 Tag + 模型 Tag + 簡介

### 13.8 Knowledge（知識庫）
- 左側：Agent 卡片 + 子專案列表 + 檔案樹
- 右側：Markdown 預覽 / 終端（Tab 切換）

### 13.9 Settings（設定）
- 水平 Tab 導覽
- 表單佈局，max-width 640px
- 危險區域紅色邊框

---

## 14. Mockup 文件清單

| 檔案 | 頁面 |
|------|------|
| `docs/design/components.html` | 共用元件庫 |
| `docs/design/mockup-dashboard.html` | 儀表板 |
| `docs/design/mockup-sessions.html` | 工作階段 |
| `docs/design/mockup-projects.html` | 專案列表 |
| `docs/design/mockup-project-detail.html` | 專案詳情 |
| `docs/design/mockup-taskboard.html` | 任務看板 |
| `docs/design/mockup-gates.html` | 審核關卡 |
| `docs/design/mockup-agents.html` | Agent 團隊 |
| `docs/design/mockup-knowledge.html` | 知識庫 |
| `docs/design/mockup-settings.html` | 設定 |

每個 mockup 包含以下狀態切換：
- ✅ 正常狀態（含示範數據）
- ✅ 空狀態（無數據時的引導）
- ✅ Loading 狀態（骨架屏或 spinner）
- ✅ Error 狀態（如適用）

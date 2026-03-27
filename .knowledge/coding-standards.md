# 編碼規範（本地版）

> **版本**: v1.0（本地化自公司 coding-standards v3.0）
> **最後更新**: 2026-03-24

---

## 通用規則

> 繼承自 `.knowledge/company/standards/coding-standards.md`

1. **不硬編碼機密資訊** — 密碼、API Key 一律用環境變數
2. **有意義的命名** — 變數/函數名稱要能說明用途
3. **單一職責** — 每個函數/類別只做一件事
4. **錯誤處理** — 外部呼叫必須有錯誤處理
5. **無死碼** — 不留註解掉的程式碼、不用的 import
6. **文件同步** — 程式碼與文件必須同步更新

## Electron Main Process（TypeScript）

- 格式化: Prettier（printWidth: 100, singleQuote: true）
- 命名: camelCase（變數/函數）, PascalCase（類別/型別）
- 檔案命名: kebab-case（`hook-manager.ts`, `session-manager.ts`）
- 嚴格模式: `strict: true`
- 服務模式: singleton export（`export const serviceName = new ServiceClass()`）
- 未使用變數: 用底線前綴 `_varName`

### Service 開發規範

```typescript
// 標準 Service 結構
class ServiceManager {
  private db: Database;

  initialize(db: Database): void { /* 注入依賴 */ }

  // public 方法 = 業務邏輯
  async doSomething(): Promise<Result> { }

  // private 方法 = 內部實作
  private parseData(): Data { }
}

export const serviceManager = new ServiceManager();
```

### IPC Handler 開發規範

```typescript
// 標準 IPC Handler 結構
export function registerXxxHandlers() {
  ipcMain.handle(IpcChannels.XXX_ACTION, async (_event, params) => {
    try {
      return await someService.doAction(params);
    } catch (error) {
      console.error('[xxx] Action failed:', error);
      throw error;
    }
  });
}
```

## Vue 3 Renderer（TypeScript + Vue SFC）

- 元件: `<script setup lang="ts">` 優先
- 命名: PascalCase 檔名（`SessionTerminal.vue`）
- Props: 使用 `defineProps<{}>()` 搭配 TypeScript 泛型
- Emit: 使用 `defineEmits<{}>()` 搭配 TypeScript 泛型
- Store: Pinia composition API 風格（`defineStore('name', () => { })`)
- 樣式: TailwindCSS 4 class，避免 `<style>` 和行內樣式

### Pinia Store 開發規範

```typescript
export const useXxxStore = defineStore('xxx', () => {
  // state
  const items = ref<Item[]>([]);
  const loading = ref(false);

  // getters
  const activeItems = computed(() => items.value.filter(i => i.active));

  // actions
  async function fetchItems() {
    loading.value = true;
    try {
      items.value = await window.maestro.xxx.list();
    } finally {
      loading.value = false;
    }
  }

  return { items, loading, activeItems, fetchItems };
});
```

## DB 命名（sql.js / SQLite）

- 表名: snake_case 複數（`claude_sessions`, `audit_logs`）
- 欄位名: snake_case（`project_id`, `created_at`）
- 主鍵: `id TEXT PRIMARY KEY`（UUID 格式）
- 時間戳: `created_at`, `updated_at`（ISO 8601 字串）
- 布林: `is_xxx`（SQLite 用 INTEGER 0/1）

## Git

- 分支: `feature/sprint1-xxx`, `fix/xxx`, `hotfix/xxx`
- Commit: `<type>(<scope>): <summary>`
- 禁止: `--no-verify`, `push --force` to main

---

## 命名規範（AgentHub 強制）

| 層 | 命名風格 | 範例 | 說明 |
|----|---------|------|------|
| 資料庫（sql.js） | snake_case | `project_id`, `created_at` | 表名、欄位名全部 snake_case |
| Electron Main Process | camelCase | `sessionManager`, `hookManager` | 服務、函數、變數 |
| Vue Renderer TypeScript | camelCase | `activeSession`, `sprintProgress` | 變數、函數、props |
| Vue 元件檔名 | PascalCase | `SessionTerminal.vue`, `GateChecklist.vue` | 元件檔案名 |
| TypeScript 型別/類別 | PascalCase | `SessionStatus`, `GateRecord` | 介面、型別、類別 |
| 一般檔案名 | kebab-case | `hook-manager.ts`, `event-parser.ts` | .ts, .vue 以外用 kebab |
| CSS | TailwindCSS 4 | `@theme` 定義 token | 避免行內樣式 |

---

## Commit 紀律（強制）

1. **一事一 commit**: 禁止「大雜燴」commit
2. **commit 前必過 lint + type-check**
3. **commit message 格式**: `<type>(<scope>): <summary>`，type 限 feat/fix/refactor/test/docs/chore
4. **lockfile 必須隨 package.json 一起 commit**

---

## 依賴與環境變數變更規則（強制）

修改 `package.json` 的 dependencies / devDependencies 後，**必須**：
1. 執行 `npm install` 更新 `package-lock.json`
2. 將 `package-lock.json` 與 `package.json` **一起 commit**
3. `node-pty` 等原生模組需額外 `npx electron-rebuild -f -w node-pty`

---

## 禁止憑空想像規則（最高強制力）

> **核心原則：不確定就去讀，不要猜。**

| 項目 | 真相來源 | 違反後果 |
|------|---------|---------|
| IPC 通道參數/回傳 | `electron/types/ipc.ts` 型別定義 | runtime undefined |
| DB 表結構 | `electron/services/database.ts` schema | query 失敗 |
| Pinia store 方法 | 對應 `src/stores/*.ts` | undefined is not a function |
| 子專案檔案格式 | `.knowledge/` 對應的格式定義文件 | FileWatcher 解析失敗 |

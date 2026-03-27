<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import BaseButton from '../components/common/BaseButton.vue';
import BaseToggle from '../components/common/BaseToggle.vue';

const settingsStore = useSettingsStore();

const activeTab = ref('general');
const saveMessage = ref('');

const tabs = [
  { key: 'general', label: '一般' },
  { key: 'claude', label: 'Claude 命令列' },
  { key: 'session', label: '工作階段' },
  { key: 'budget', label: '預算' },
  { key: 'notification', label: '通知' },
  { key: 'shortcuts', label: '快捷鍵' },
  { key: 'permissions', label: '權限' },
];

// Local form state
const form = ref({
  // General
  language: 'zh-TW',
  projectRoot: '',
  // Claude Code
  cliPath: 'claude',
  defaultModel: 'sonnet',
  maxTurns: '25',
  // Session
  autoSave: 'true',
  terminalFontSize: '13',
  // Budget (token limits)
  dailyTokenLimit: '500000',
  totalTokenLimit: '10000000',
  alertThreshold: '80',
  // Notification
  notifySessionComplete: 'true',
  notifySessionFailed: 'true',
  notifyBudgetWarning: 'true',
  notifyGateSubmit: 'true',
});

// --- Permissions / Auto-approve rules ---
interface AutoApproveRule {
  id: string;
  name: string;
  enabled: boolean;
  gateTypes: string[];
  projectIds?: string[];
}

const autoApproveRules = ref<AutoApproveRule[]>([]);
const showNewRuleForm = ref(false);
const newRuleName = ref('');
const newRuleGateTypes = ref<string[]>([]);
const availableGateTypes = ['G0', 'G1', 'G2', 'G3', 'G4'];

async function loadAutoApproveRules() {
  const prefs = settingsStore.preferences;
  const raw = prefs['gate.auto-approve-rules'];
  if (raw) {
    try {
      autoApproveRules.value = JSON.parse(raw);
    } catch {
      autoApproveRules.value = [];
    }
  }
}

async function saveAutoApproveRules() {
  await settingsStore.update(
    'gate.auto-approve-rules',
    JSON.stringify(autoApproveRules.value),
    'permissions',
  );
}

function addAutoApproveRule() {
  if (!newRuleName.value.trim() || newRuleGateTypes.value.length === 0) return;
  autoApproveRules.value.push({
    id: `rule-${Date.now()}`,
    name: newRuleName.value.trim(),
    enabled: true,
    gateTypes: [...newRuleGateTypes.value],
  });
  newRuleName.value = '';
  newRuleGateTypes.value = [];
  showNewRuleForm.value = false;
  saveAutoApproveRules();
}

function toggleRuleEnabled(rule: AutoApproveRule) {
  rule.enabled = !rule.enabled;
  saveAutoApproveRules();
}

function deleteRule(id: string) {
  autoApproveRules.value = autoApproveRules.value.filter((r) => r.id !== id);
  saveAutoApproveRules();
}

function toggleGateType(type: string) {
  const idx = newRuleGateTypes.value.indexOf(type);
  if (idx >= 0) {
    newRuleGateTypes.value.splice(idx, 1);
  } else {
    newRuleGateTypes.value.push(type);
  }
}

const clearing = ref(false);
const clearMessage = ref('');
const clearError = ref('');

async function handleClearDatabase() {
  const confirmed = window.confirm(
    '警告：此操作將永久刪除所有業務資料，包含所有專案、任務、衝刺、工作階段記錄、審計日誌等。\n\n資料庫結構（schema_migrations）將保留，應用程式不會損壞。\n\n此操作無法復原，請確認後繼續。',
  );
  if (!confirmed) return;

  clearing.value = true;
  clearMessage.value = '';
  clearError.value = '';
  try {
    const result = await window.maestro.system.clearDatabase();
    const totalDeleted = Object.values(result.deletedCounts).reduce((a, b) => a + b, 0);
    clearMessage.value = `已清除完成，共刪除 ${totalDeleted} 筆資料。`;
    setTimeout(() => { clearMessage.value = ''; }, 5000);
  } catch (err: unknown) {
    clearError.value = err instanceof Error ? err.message : '清除失敗，請稍後再試。';
    setTimeout(() => { clearError.value = ''; }, 5000);
  } finally {
    clearing.value = false;
  }
}

onMounted(async () => {
  await settingsStore.fetchAll();
  // Populate form from stored preferences
  const prefs = settingsStore.preferences;
  for (const key of Object.keys(form.value) as Array<keyof typeof form.value>) {
    if (prefs[key] !== undefined) {
      form.value[key] = prefs[key];
    }
  }
  // 載入自動審核規則
  await loadAutoApproveRules();
});

async function save() {
  const entries = Object.entries(form.value);
  for (const [key, value] of entries) {
    const category = getCategoryForKey(key);
    await settingsStore.update(key, String(value), category);
  }
  saveMessage.value = '設定已儲存';
  setTimeout(() => { saveMessage.value = ''; }, 2000);
}

function getCategoryForKey(key: string): string {
  if (['language', 'projectRoot'].includes(key)) return 'general';
  if (['cliPath', 'defaultModel', 'maxTurns'].includes(key)) return 'claude';
  if (['autoSave', 'terminalFontSize'].includes(key)) return 'session';
  if (['dailyTokenLimit', 'totalTokenLimit', 'alertThreshold'].includes(key)) return 'budget';
  return 'notification';
}

const models = [
  { value: 'opus', label: 'Claude Opus' },
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'haiku', label: 'Claude Haiku' },
];

</script>

<template>
  <div class="settings-view">
    <!-- Horizontal tab navigation -->
    <div class="settings-tab-nav">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="settings-tab-btn"
        :class="{ 'is-active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Content area -->
    <div class="settings-content">

      <!-- ── Tab: 一般 ── -->
      <div v-show="activeTab === 'general'" class="settings-tab-panel">
        <!-- Main card -->
        <div class="settings-card">
          <p class="settings-section-title">一般設定</p>

          <div class="form-field">
            <label class="field-label">語言</label>
            <select v-model="form.language" class="field-select">
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
            </select>
          </div>

          <div class="form-field">
            <label class="field-label">專案根目錄</label>
            <input
              v-model="form.projectRoot"
              type="text"
              placeholder="C:\projects"
              class="field-input field-input--full"
            />
            <p class="field-hint">所有子專案的預設存放路徑</p>
          </div>
        </div>

        <!-- Danger zone -->
        <div class="danger-zone">
          <div class="danger-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            危險區域
          </div>
          <p class="danger-desc">以下操作具有不可復原的風險，請謹慎操作。</p>
          <div class="danger-row">
            <div class="danger-row-info">
              <div class="danger-row-label">清除所有資料</div>
              <div class="danger-row-desc">刪除所有專案、任務、工作階段記錄與設定</div>
            </div>
            <BaseButton
              variant="danger"
              size="sm"
              :loading="clearing"
              @click="handleClearDatabase"
            >
              {{ clearing ? '清除中...' : '清除所有資料' }}
            </BaseButton>
          </div>
          <p v-if="clearMessage" class="feedback-success">{{ clearMessage }}</p>
          <p v-if="clearError" class="feedback-danger">{{ clearError }}</p>
        </div>

        <!-- Save row -->
        <div class="save-row">
          <BaseButton variant="ghost" @click="save">儲存設定</BaseButton>
          <span v-if="saveMessage" class="save-success-msg">
            <span class="save-dot" aria-hidden="true"></span>
            {{ saveMessage }}
          </span>
        </div>
      </div>

      <!-- ── Tab: Claude 命令列 ── -->
      <div v-show="activeTab === 'claude'" class="settings-tab-panel">
        <div class="settings-card">
          <p class="settings-section-title">Claude 命令列設定</p>

          <div class="form-field">
            <label class="field-label">CLI 路徑</label>
            <input
              v-model="form.cliPath"
              type="text"
              class="field-input field-input--full"
            />
            <p class="field-hint">Claude CLI 可執行檔路徑或指令名稱</p>
          </div>

          <div class="form-field">
            <label class="field-label">預設 Model</label>
            <select v-model="form.defaultModel" class="field-select">
              <option v-for="m in models" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>

          <div class="form-field">
            <label class="field-label">最大回合數</label>
            <input
              v-model="form.maxTurns"
              type="number"
              min="1"
              max="100"
              class="field-input field-input--narrow"
            />
            <p class="field-hint">每個工作階段最多允許的對話回合數（1–100）</p>
          </div>
        </div>

        <div class="save-row">
          <BaseButton variant="ghost" @click="save">儲存設定</BaseButton>
          <span v-if="saveMessage" class="save-success-msg">
            <span class="save-dot" aria-hidden="true"></span>
            {{ saveMessage }}
          </span>
        </div>
      </div>

      <!-- ── Tab: 工作階段 ── -->
      <div v-show="activeTab === 'session'" class="settings-tab-panel">
        <div class="settings-card">
          <p class="settings-section-title">工作階段設定</p>

          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-title">自動儲存</div>
              <div class="toggle-desc">Session 結束後自動儲存記錄</div>
            </div>
            <BaseToggle
              :model-value="form.autoSave === 'true'"
              @update:model-value="form.autoSave = $event ? 'true' : 'false'"
            />
          </div>

          <div class="form-field form-field--mt">
            <label class="field-label">終端字體大小</label>
            <input
              v-model="form.terminalFontSize"
              type="number"
              min="10"
              max="24"
              class="field-input field-input--narrow"
            />
            <p class="field-hint">終端機輸出的字體大小（px）</p>
          </div>
        </div>

        <div class="save-row">
          <BaseButton variant="ghost" @click="save">儲存設定</BaseButton>
          <span v-if="saveMessage" class="save-success-msg">
            <span class="save-dot" aria-hidden="true"></span>
            {{ saveMessage }}
          </span>
        </div>
      </div>

      <!-- ── Tab: 預算 ── -->
      <div v-show="activeTab === 'budget'" class="settings-tab-panel">
        <div class="settings-card">
          <p class="settings-section-title">預算設定</p>

          <div class="form-field">
            <label class="field-label">每日 Token 限額</label>
            <input
              v-model="form.dailyTokenLimit"
              type="number"
              min="0"
              step="50000"
              class="field-input field-input--wide"
            />
            <p class="field-hint">每天最多消耗的 token 數量</p>
          </div>

          <div class="form-field">
            <label class="field-label">總 Token 限額</label>
            <input
              v-model="form.totalTokenLimit"
              type="number"
              min="0"
              step="1000000"
              class="field-input field-input--wide"
            />
            <p class="field-hint">累計最多消耗的 token 數量</p>
          </div>

          <div class="form-field">
            <label class="field-label">警示閾值 (%)</label>
            <input
              v-model="form.alertThreshold"
              type="number"
              min="50"
              max="100"
              class="field-input field-input--narrow"
            />
            <p class="field-hint">超過此百分比時觸發預算警告通知</p>
          </div>
        </div>

        <div class="save-row">
          <BaseButton variant="ghost" @click="save">儲存設定</BaseButton>
          <span v-if="saveMessage" class="save-success-msg">
            <span class="save-dot" aria-hidden="true"></span>
            {{ saveMessage }}
          </span>
        </div>
      </div>

      <!-- ── Tab: 通知 ── -->
      <div v-show="activeTab === 'notification'" class="settings-tab-panel">
        <div class="settings-card">
          <p class="settings-section-title">通知設定</p>

          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-title">工作階段完成</div>
              <div class="toggle-desc">代理人完成任務時通知</div>
            </div>
            <BaseToggle
              :model-value="form.notifySessionComplete === 'true'"
              @update:model-value="form.notifySessionComplete = $event ? 'true' : 'false'"
            />
          </div>

          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-title">工作階段失敗</div>
              <div class="toggle-desc">代理人執行失敗時通知</div>
            </div>
            <BaseToggle
              :model-value="form.notifySessionFailed === 'true'"
              @update:model-value="form.notifySessionFailed = $event ? 'true' : 'false'"
            />
          </div>

          <div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-title">預算警告</div>
              <div class="toggle-desc">預算超過閾值時通知</div>
            </div>
            <BaseToggle
              :model-value="form.notifyBudgetWarning === 'true'"
              @update:model-value="form.notifyBudgetWarning = $event ? 'true' : 'false'"
            />
          </div>

          <div class="toggle-row toggle-row--last">
            <div class="toggle-info">
              <div class="toggle-title">關卡提交</div>
              <div class="toggle-desc">審核關卡提交時通知</div>
            </div>
            <BaseToggle
              :model-value="form.notifyGateSubmit === 'true'"
              @update:model-value="form.notifyGateSubmit = $event ? 'true' : 'false'"
            />
          </div>
        </div>

        <div class="save-row">
          <BaseButton variant="ghost" @click="save">儲存設定</BaseButton>
          <span v-if="saveMessage" class="save-success-msg">
            <span class="save-dot" aria-hidden="true"></span>
            {{ saveMessage }}
          </span>
        </div>
      </div>

      <!-- ── Tab: 快捷鍵 ── -->
      <div v-show="activeTab === 'shortcuts'" class="settings-tab-panel">
        <div class="settings-card">
          <p class="settings-section-title">全域快捷鍵</p>

          <div class="shortcut-row">
            <div class="shortcut-info">
              <div class="shortcut-name">顯示/隱藏視窗</div>
              <div class="shortcut-desc">在任何地方切換 Maestro 視窗</div>
            </div>
            <kbd>Ctrl+Shift+M</kbd>
          </div>

          <div class="shortcut-row">
            <div class="shortcut-info">
              <div class="shortcut-name">命令面板</div>
              <div class="shortcut-desc">搜尋並執行快速命令</div>
            </div>
            <kbd>Ctrl+K</kbd>
          </div>

          <div class="shortcut-row shortcut-row--last">
            <div class="shortcut-info">
              <div class="shortcut-name">新增工作階段</div>
              <div class="shortcut-desc">快速啟動新的工作階段</div>
            </div>
            <kbd>Ctrl+N</kbd>
          </div>
        </div>
      </div>

      <!-- ── Tab: 權限 ── -->
      <div v-show="activeTab === 'permissions'" class="settings-tab-panel">
        <div class="settings-card">
          <p class="settings-section-title">自動審核規則</p>
          <p class="permissions-desc">符合規則的 Gate 將自動通過審核，無需人工介入。</p>

          <!-- Rules list -->
          <div v-if="autoApproveRules.length > 0" class="rules-list">
            <div
              v-for="rule in autoApproveRules"
              :key="rule.id"
              class="rule-card"
            >
              <div class="rule-header">
                <BaseToggle :model-value="rule.enabled" @update:model-value="toggleRuleEnabled(rule)" />
                <div class="rule-name">{{ rule.name }}</div>
              </div>
              <div class="rule-scope">
                適用：
                <span v-for="gt in rule.gateTypes" :key="gt" class="rule-gate-tag">{{ gt }}</span>
              </div>
              <div class="rule-footer">
                <button class="rule-delete-btn" @click="deleteRule(rule.id)">刪除</button>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="rules-empty">
            尚無自動審核規則
          </div>

          <!-- New rule form -->
          <div v-if="showNewRuleForm" class="new-rule-form">
            <div class="form-field">
              <label class="field-label">規則名稱</label>
              <input
                v-model="newRuleName"
                type="text"
                class="field-input field-input--full"
                placeholder="例如：自動通過需求確認"
              />
            </div>
            <div class="form-field">
              <label class="field-label">適用 Gate 類型</label>
              <div class="gate-type-list">
                <button
                  v-for="gt in availableGateTypes"
                  :key="gt"
                  class="gate-type-btn"
                  :class="{ 'is-selected': newRuleGateTypes.includes(gt) }"
                  @click="toggleGateType(gt)"
                >
                  {{ gt }}
                </button>
              </div>
            </div>
            <div class="new-rule-actions">
              <BaseButton
                variant="primary"
                size="sm"
                :disabled="!newRuleName.trim() || newRuleGateTypes.length === 0"
                @click="addAutoApproveRule"
              >
                儲存規則
              </BaseButton>
              <BaseButton variant="ghost" size="sm" @click="showNewRuleForm = false">
                取消
              </BaseButton>
            </div>
          </div>

          <BaseButton
            v-if="!showNewRuleForm"
            variant="secondary"
            size="sm"
            class="add-rule-btn"
            @click="showNewRuleForm = true"
          >
            + 新增規則
          </BaseButton>
        </div>

        <!-- Warning banner -->
        <div class="warning-banner">
          <svg class="warning-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>G5（部署就緒）和 G6（正式發佈）始終需要手動審核，無法設定自動通過。</span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Tab navigation ── */
.settings-tab-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border-default);
  overflow-x: auto;
  flex-shrink: 0;
  margin-bottom: 0;
}
.settings-tab-nav::-webkit-scrollbar {
  display: none;
}

.settings-tab-btn {
  padding: 10px 16px;
  font-size: 13px;
  font-family: inherit;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.settings-tab-btn:hover {
  color: var(--color-text-primary);
}
.settings-tab-btn.is-active {
  border-bottom-color: var(--color-accent);
  color: var(--color-accent-light);
  font-weight: 600;
}

/* ── Content area ── */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0 40px;
}
.settings-content::-webkit-scrollbar {
  width: 6px;
}
.settings-content::-webkit-scrollbar-track {
  background: transparent;
}
.settings-content::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 3px;
}

.settings-tab-panel {
  max-width: 640px;
}

/* ── Settings card ── */
.settings-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 16px;
}

.settings-section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
}

/* ── Form fields ── */
.form-field {
  margin-bottom: 20px;
}
.form-field:last-child {
  margin-bottom: 0;
}
.form-field--mt {
  margin-top: 20px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 6px;
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.field-input {
  padding: 9px 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  appearance: none;
}
.field-input:focus {
  border-color: var(--color-accent);
}
.field-input--full {
  width: 100%;
}
.field-input--narrow {
  width: 120px;
}
.field-input--wide {
  width: 180px;
}

.field-select {
  width: 100%;
  padding: 9px 36px 9px 12px;
  background: var(--color-bg-primary);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b8da3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  appearance: none;
  cursor: pointer;
}
.field-select:focus {
  border-color: var(--color-accent);
}

/* ── Toggle rows ── */
.toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border-default);
}
.toggle-row:first-of-type {
  padding-top: 0;
}
.toggle-row--last {
  border-bottom: none;
  padding-bottom: 0;
}

.toggle-info {
  flex: 1;
}
.toggle-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}
.toggle-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ── Shortcuts ── */
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border-default);
}
.shortcut-row:first-of-type {
  padding-top: 0;
}
.shortcut-row--last {
  border-bottom: none;
  padding-bottom: 0;
}
.shortcut-info {
  flex: 1;
}
.shortcut-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}
.shortcut-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

kbd {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-hover);
  font-family: 'Cascadia Code', 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* ── Danger zone ── */
.danger-zone {
  border: 1px solid rgba(255, 107, 107, 0.35);
  background: rgba(255, 107, 107, 0.05);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.danger-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-danger);
  margin-bottom: 8px;
}

.danger-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.danger-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.danger-row-info {
  flex: 1;
}
.danger-row-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}
.danger-row-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

.feedback-success {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-success);
}
.feedback-danger {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-danger);
}

/* ── Save row ── */
.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}

.save-success-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-success);
}

.save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
}

/* ── Permissions ── */
.permissions-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 20px;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.rule-card {
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border-default);
  border-radius: 10px;
  padding: 14px 16px;
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.rule-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.rule-scope {
  font-size: 11px;
  color: var(--color-text-muted);
}

.rule-gate-tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--color-bg-active);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  font-size: 11px;
  margin-left: 4px;
}

.rule-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-default);
}

.rule-delete-btn {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--color-danger);
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}
.rule-delete-btn:hover {
  opacity: 0.75;
  text-decoration: underline;
}

.rules-empty {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.new-rule-form {
  background: rgba(108, 92, 231, 0.05);
  border: 1px solid rgba(108, 92, 231, 0.3);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}
.new-rule-form .form-field:last-of-type {
  margin-bottom: 16px;
}

.gate-type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gate-type-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-primary);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.gate-type-btn:hover {
  border-color: rgba(108, 92, 231, 0.4);
}
.gate-type-btn.is-selected {
  border-color: var(--color-accent);
  background: rgba(108, 92, 231, 0.15);
  color: var(--color-accent-light);
}

.new-rule-actions {
  display: flex;
  gap: 8px;
}

.add-rule-btn {
  margin-top: 4px;
}

/* ── Warning banner ── */
.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgba(255, 170, 0, 0.3);
  background: rgba(255, 170, 0, 0.05);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--color-warning);
  line-height: 1.5;
}
.warning-icon {
  flex-shrink: 0;
  margin-top: 1px;
}
</style>

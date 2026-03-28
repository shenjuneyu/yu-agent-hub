<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import BaseButton from '../components/common/BaseButton.vue';

const settingsStore = useSettingsStore();

const activeTab = ref('general');
const tabs = [
  { key: 'general', label: '一般' },
];

const saveMessage = ref('');

// Local form state
const form = ref({
  language: 'zh-TW',
  projectRoot: '',
});

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
  const prefs = settingsStore.preferences;
  for (const key of Object.keys(form.value) as Array<keyof typeof form.value>) {
    if (prefs[key] !== undefined) {
      form.value[key] = prefs[key];
    }
  }
});

async function save() {
  const entries = Object.entries(form.value);
  for (const [key, value] of entries) {
    await settingsStore.update(key, String(value), 'general');
  }
  saveMessage.value = '設定已儲存';
  setTimeout(() => { saveMessage.value = ''; }, 2000);
}
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

    <div class="settings-content">
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
</style>

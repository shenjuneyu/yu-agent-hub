<template>
  <div class="skill-tab">
    <!-- Left Panel -->
    <div class="panel-left">
      <!-- Skill Actions -->
      <div class="skill-actions">
        <button class="btn btn-outline" @click="showExportModal = true">
          📤 匯出
        </button>
        <button class="btn btn-outline" @click="showImportModal = true">
          📥 匯入
        </button>
      </div>

      <!-- Search Row -->
      <div class="search-row">
        <div class="search-input-wrap">
          <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <input
            v-model="store.searchQuery"
            type="text"
            class="search-input"
            placeholder="搜尋 Skill..."
          />
        </div>

        <div class="filter-wrap">
          <select v-model="store.projectFilter" class="project-filter">
            <option value="all">全部</option>
            <option
              v-for="proj in projectPaths"
              :key="proj"
              :value="proj"
            >{{ projLabel(proj) }}</option>
          </select>
          <svg class="filter-arrow" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Skill List -->
      <div class="skill-list">
        <!-- Empty State -->
        <div v-if="store.filteredSkills.length === 0 && !store.loading" class="empty-state">
          <span class="empty-icon">🧩</span>
          <p class="empty-title">尚無 Skill</p>
          <p class="empty-desc">透過 Agent 對話建立第一個 Skill</p>
        </div>

        <!-- Loading -->
        <div v-else-if="store.loading" class="loading-state">
          載入中...
        </div>

        <!-- Items -->
        <div
          v-for="skill in store.filteredSkills"
          :key="skill.name"
          class="list-item"
          :class="{
            'is-selected': store.selectedSkill?.name === skill.name,
            'is-custom': skill.source === 'custom',
          }"
          @click="store.selectSkill(skill.name, skill.scope, skill.projectPath)"
        >
          <div class="item-main">
            <div class="item-top">
              <span class="item-name">{{ skill.name }}</span>
              <button
                v-if="skill.source === 'custom'"
                class="edit-btn"
                title="編輯"
                @click.stop="onEditSkill(skill)"
              >✏️</button>
            </div>
            <span class="item-path">{{ skill.path }}</span>
            <div class="item-meta">
              <!-- Source tag -->
              <span v-if="skill.source === 'system'" class="tag tag-system">System</span>
              <span v-else class="tag tag-custom">Custom</span>
              <!-- Scope tag -->
              <span v-if="skill.scope === 'global'" class="tag tag-global">全域</span>
              <span v-else class="tag tag-project">{{ projLabel(skill.projectPath) }}</span>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Export Modal -->
    <div v-if="showExportModal" class="modal-overlay" @click.self="showExportModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>匯出 Skills</h3>
          <button class="modal-close" @click="showExportModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <textarea readonly class="json-display" :value="exportJson"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="copyExportJson">
            {{ copied ? '✓ 已複製' : '📋 複製到剪貼板' }}
          </button>
          <button class="btn btn-outline" @click="showExportModal = false">關閉</button>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>匯入 Skills</h3>
          <button class="modal-close" @click="showImportModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <textarea
            v-model="importJson"
            class="json-input"
            placeholder="貼上 JSON..."
          ></textarea>
          <div v-if="importError" class="import-error">{{ importError }}</div>
          <div v-if="importResult" class="import-result">
            <p v-if="importResult.imported.length">✅ 匯入: {{ importResult.imported.join(', ') }}</p>
            <p v-if="importResult.skipped.length">⏭ 跳過: {{ importResult.skipped.join(', ') }}</p>
            <p v-if="importResult.overwritten.length">🔄 覆寫: {{ importResult.overwritten.join(', ') }}</p>
            <p v-if="importResult.errors.length">❌ 錯誤: {{ importResult.errors.join(', ') }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <div v-if="showConflictChoice" class="conflict-choice">
            <span>偵測到重複 Skill，如何處理？</span>
            <button class="btn btn-outline" @click="doImport('skip')">跳過重複</button>
            <button class="btn btn-warning" @click="doImport('overwrite')">覆蓋重複</button>
          </div>
          <template v-else>
            <button class="btn btn-primary" @click="handleImport" :disabled="!importJson.trim()">
              匯入
            </button>
            <button class="btn btn-outline" @click="closeImportModal">關閉</button>
          </template>
        </div>
      </div>
    </div>

    <!-- Right Panel -->
    <div class="panel-right">
      <!-- No Selection State -->
      <div v-if="!store.selectedSkill" class="no-selection">
        <span class="no-sel-icon">🧩</span>
        <p class="no-sel-text">從左側選擇一個 Skill 查看詳情</p>
      </div>

      <!-- Selected Skill Detail — always preview -->
      <div v-else class="preview-wrap">
        <!-- Detail Header -->
        <div class="detail-header">
          <div class="detail-header-top">
            <div class="header-title-row">
              <h2 class="detail-title">{{ store.selectedSkill.name }}</h2>
              <span
                class="tag"
                :class="store.selectedSkill.source === 'system' ? 'tag-system' : 'tag-custom'"
              >{{ store.selectedSkill.source === 'system' ? 'System' : 'Custom' }}</span>
            </div>
            <div class="detail-meta-row">
              <span class="detail-path">{{ store.selectedSkill.path }}</span>
              <span class="detail-status is-enabled">
                <span class="status-dot"></span>
                已啟用
              </span>
            </div>
          </div>
        </div>

        <!-- Detail Body -->
        <div class="detail-body">
          <div v-if="store.selectedSkill.content" class="md-block">{{ store.selectedSkill.content }}</div>
          <p v-else class="md-p no-content-text">（此 Skill 尚無內容）</p>
        </div>

        <!-- Detail Footer -->
        <div class="detail-footer">
          <div class="footer-meta" v-if="store.selectedSkill.updatedAt">
            更新時間：<span class="footer-mono">{{ store.selectedSkill.updatedAt }}</span>
          </div>
          <div class="footer-meta" v-if="store.selectedSkill.fileSize !== undefined">
            大小：<span class="footer-mono">{{ formatSize(store.selectedSkill.fileSize) }}</span>
          </div>
          <div class="footer-meta">
            範圍：<span class="footer-mono">{{ store.selectedSkill.scope === 'global' ? '全域' : projLabel(store.selectedSkill.projectPath) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useHarnessStore } from '../../stores/harness';
import { useIpc } from '../../composables/useIpc';
import type { SkillItem } from '../../stores/harness';

const store = useHarnessStore();
const ipc = useIpc();

// ── Export / Import state ─────────────────────────────────
const showExportModal = ref(false);
const showImportModal = ref(false);
const exportJson = ref('');
const importJson = ref('');
const importError = ref('');
const importResult = ref<{ imported: string[]; skipped: string[]; overwritten: string[]; errors: string[] } | null>(null);
const copied = ref(false);
const showConflictChoice = ref(false);
const parsedBundle = ref<unknown>(null);

// Export: fetch bundle whenever modal opens
watch(showExportModal, async (show) => {
  if (!show) return;
  copied.value = false;
  const names = store.skills.map(s => s.name);
  if (names.length === 0) {
    exportJson.value = '{"error": "No skills to export"}';
    return;
  }
  try {
    const bundle = await ipc.exportSkills(names);
    exportJson.value = JSON.stringify(bundle, null, 2);
  } catch (e) {
    exportJson.value = `{"error": "${String(e)}"}`;
  }
});

async function copyExportJson() {
  await navigator.clipboard.writeText(exportJson.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

// Import
function handleImport() {
  importError.value = '';
  importResult.value = null;
  let bundle: any;
  try {
    bundle = JSON.parse(importJson.value);
  } catch (e) {
    importError.value = `JSON 解析失敗: ${String(e)}`;
    return;
  }
  if (!bundle.version || !Array.isArray(bundle.skills)) {
    importError.value = 'JSON 格式不正確：缺少 version 或 skills 欄位';
    return;
  }
  parsedBundle.value = bundle;
  const existingNames = store.skills.map(s => s.name);
  const conflicts = bundle.skills.filter((s: any) => existingNames.includes(s.name));
  if (conflicts.length > 0) {
    showConflictChoice.value = true;
  } else {
    doImport('skip');
  }
}

async function doImport(onConflict: 'skip' | 'overwrite') {
  showConflictChoice.value = false;
  try {
    importResult.value = await ipc.importSkills(parsedBundle.value, onConflict) as {
      imported: string[];
      skipped: string[];
      overwritten: string[];
      errors: string[];
    };
    await store.fetchSkills();
  } catch (e) {
    importError.value = `匯入失敗: ${String(e)}`;
  }
}

function closeImportModal() {
  showImportModal.value = false;
  importJson.value = '';
  importError.value = '';
  importResult.value = null;
  showConflictChoice.value = false;
  parsedBundle.value = null;
}

// Derive unique project paths from all skills
const projectPaths = computed(() => {
  const paths = new Set<string>();
  store.skills.forEach(s => {
    if (s.scope === 'project' && s.projectPath) paths.add(s.projectPath);
  });
  return Array.from(paths);
});

function projLabel(path?: string): string {
  if (!path) return '未知專案';
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function onEditSkill(skill: SkillItem) {
  // Placeholder — will be wired to IPC in a future sprint
  console.log('[SkillTab] onEditSkill', skill.name);
}
</script>

<style scoped>
/* ─── Layout ─────────────────────────────────────────── */
.skill-tab {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* ─── Left Panel ─────────────────────────────────────── */
.panel-left {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-default);
  overflow: hidden;
}

/* Search Row */
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.search-input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 13px;
  height: 13px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 12px 7px 32px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-input:focus {
  border-color: var(--color-accent);
}

/* Project Filter */
.filter-wrap {
  position: relative;
  flex-shrink: 0;
}

.project-filter {
  appearance: none;
  -webkit-appearance: none;
  padding: 6px 24px 6px 8px;
  border-radius: 6px;
  font-size: 11px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.project-filter:focus {
  border-color: var(--color-accent);
}

.filter-arrow {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 6px;
  color: var(--color-text-muted);
  pointer-events: none;
}

/* Skill List */
.skill-list {
  flex: 1;
  overflow-y: auto;
}

/* Empty / Loading States */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  gap: 8px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  opacity: 0.4;
  line-height: 1;
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  max-width: 220px;
  line-height: 1.5;
  text-align: center;
}

.loading-state {
  padding: 24px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

/* List Item */
.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-default);
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background 0.12s, border-left-color 0.12s;
  position: relative;
}

.list-item:hover {
  background: var(--color-bg-hover);
}

.list-item.is-selected {
  border-left-color: var(--color-accent);
  background: var(--color-bg-active);
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Edit button — hidden until hover on custom items */
.edit-btn {
  background: none;
  border: none;
  padding: 0 2px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  line-height: 1;
  flex-shrink: 0;
}

.list-item.is-custom:hover .edit-btn {
  opacity: 1;
}

.item-path {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

/* Tags */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
}

.tag-system {
  background: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.tag-custom {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

.tag-global {
  background: rgba(51, 154, 240, 0.2);
  color: var(--color-info);
}

.tag-project {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

/* ─── Right Panel ─────────────────────────────────────── */
.panel-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* No Selection */
.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.no-sel-icon {
  font-size: 36px;
  opacity: 0.25;
  line-height: 1;
}

.no-sel-text {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

/* ─── Preview Mode ────────────────────────────────────── */
.preview-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Detail Header */
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.detail-header-top {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.detail-meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.detail-path {
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: var(--color-text-muted);
  word-break: break-all;
}

.detail-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
  transition: background 0.2s;
}

.detail-status.is-enabled .status-dot {
  background: var(--color-success);
}

.detail-status.is-enabled {
  color: var(--color-success);
}

/* Detail Body */
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Markdown-style elements */
.md-h1 {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 12px;
}

.md-h2 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 20px 0 6px;
}

.md-p {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 0 0 10px;
}

.no-content-text {
  font-style: italic;
}

.md-code {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: var(--color-accent-light);
}

.md-block {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-left: 3px solid var(--color-accent);
  border-radius: 6px;
  padding: 12px 14px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  margin: 0;
}

.md-list {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
}

.md-list li {
  padding-left: 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  position: relative;
}

.md-list li::before {
  content: '–';
  position: absolute;
  left: 0;
  color: var(--color-accent);
}

/* Detail Footer */
.detail-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.footer-meta {
  font-size: 11px;
  color: var(--color-text-muted);
}

.footer-mono {
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--color-text-secondary);
}

/* ─── Skill Actions ───────────────────────────────────── */
.skill-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

/* ─── Buttons ─────────────────────────────────────────── */
.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s;
}

.btn-outline:hover {
  background: var(--color-bg-hover);
}

.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: opacity 0.15s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-warning {
  background: var(--color-warning, #f59e0b);
  color: #000;
  border: none;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: opacity 0.15s;
}

.btn-warning:hover {
  opacity: 0.9;
}

/* ─── Modal ───────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}

.modal-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-default);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.json-display,
.json-input {
  width: 100%;
  min-height: 300px;
  box-sizing: border-box;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 12px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
}

.json-input:focus {
  border-color: var(--color-accent);
}

.import-error {
  color: var(--color-danger, #ff6b6b);
  font-size: 12px;
  margin-top: 8px;
}

.import-result {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.import-result p {
  margin: 0;
}

.conflict-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 12px;
  color: var(--color-warning, #f59e0b);
}
</style>

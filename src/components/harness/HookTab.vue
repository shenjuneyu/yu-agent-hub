<template>
  <div class="hook-tab">
    <!-- Left Panel -->
    <div class="panel-left">
      <!-- Search Row -->
      <div class="search-row">
        <input
          v-model="store.searchQuery"
          class="search-input"
          type="text"
          placeholder="搜尋 Hook..."
        />
        <select v-model="store.projectFilter" class="project-filter">
          <option value="all">全部</option>
          <option
            v-for="proj in projectPaths"
            :key="proj"
            :value="proj"
          >{{ projLabel(proj) }}</option>
        </select>
      </div>

      <!-- Hook List -->
      <div class="hook-list">
        <!-- Empty state -->
        <div v-if="store.filteredHooks.length === 0" class="list-empty">
          <span class="list-empty-icon">🪝</span>
          <span class="list-empty-text">尚無 Hook</span>
          <span class="list-empty-sub">在 .claude/settings.json 中的 hooks 欄位配置 Hook 規則</span>
        </div>

        <!-- Items -->
        <div
          v-for="hook in store.filteredHooks"
          :key="hook.name"
          class="list-item"
          :class="{
            'is-selected': store.selectedHook?.name === hook.name
          }"
          @click="store.selectHook(hook.name, hook.scope, hook.projectPath)"
        >
          <div class="item-main">
            <div class="item-header">
              <span class="item-name">{{ hook.name }}</span>
            </div>

            <div class="item-matcher">{{ hook.matcher }}</div>

            <div class="item-tags">
              <!-- Hook type tag -->
              <span
                class="tag"
                :class="hookTypeClass(hook.hookType)"
              >{{ hook.hookType }}</span>

              <!-- Scope tag -->
              <span
                class="tag"
                :class="hook.scope === 'global' ? 'tag-scope-global' : 'tag-scope-project'"
              >
                {{ hook.scope === 'global' ? '全域' : (hook.projectPath ?? hook.scope) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel -->
    <div class="panel-right">
      <!-- No selection -->
      <div v-if="!store.selectedHook" class="no-selection">
        <span class="no-selection-icon">🪝</span>
        <span class="no-selection-title">從左側選擇一個 Hook 查看詳情</span>
      </div>

      <!-- Selected Hook Detail — always preview -->
      <div v-else class="detail-view">
        <!-- Detail Header -->
        <div class="detail-header">
          <div class="detail-title-row">
            <h2 class="detail-title">{{ store.selectedHook.name }}</h2>
            <span
              class="tag"
              :class="hookTypeClass(store.selectedHook.hookType)"
            >{{ store.selectedHook.hookType }}</span>
          </div>
          <div class="detail-meta-row">
            <span class="meta-label">Matcher</span>
            <code class="meta-matcher">{{ store.selectedHook.matcher }}</code>
            <span class="meta-status status-enabled">已啟用</span>
          </div>
        </div>

        <!-- Detail Body -->
        <div class="detail-body">
          <div class="md-h1">{{ store.selectedHook.name }}</div>
          <p class="md-p">此 Hook 在 {{ store.selectedHook.hookType }} 事件觸發時執行攔截邏輯。</p>
          <hr class="md-divider" />

          <div class="md-h2">類型</div>
          <div class="md-section-row">
            <span
              class="tag"
              :class="hookTypeClass(store.selectedHook.hookType)"
            >{{ store.selectedHook.hookType }}</span>
            <span class="md-p">{{ hookTypeDescription(store.selectedHook.hookType) }}</span>
          </div>

          <div class="md-h2">Matcher 規則</div>
          <pre class="md-block">{{ formatMatcherJson(store.selectedHook.matcher) }}</pre>

          <div class="md-h2">處理邏輯</div>
          <ul class="md-list">
            <li>接收工具呼叫事件</li>
            <li>比對 Matcher 規則：<code>{{ store.selectedHook.matcher }}</code></li>
            <li>執行 Hook 腳本並返回結果</li>
            <li>依結果決定阻擋或放行</li>
          </ul>

          <template v-if="store.selectedHook.script">
            <div class="md-h2">Hook 腳本</div>
            <pre class="md-block md-block-script">{{ store.selectedHook.script }}</pre>
          </template>
        </div>

        <!-- Detail Footer -->
        <div class="detail-footer">
          <div class="footer-row">
            <span class="footer-label">設定檔</span>
            <code class="footer-value">.claude/settings.json</code>
          </div>
          <div class="footer-row">
            <span class="footer-label">最後修改</span>
            <span class="footer-value">{{ store.selectedHook.updatedAt ?? '—' }}</span>
          </div>
          <div class="footer-row">
            <span class="footer-label">觸發次數</span>
            <span class="footer-value">{{ store.selectedHook.triggerCount ?? 0 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useHarnessStore } from '../../stores/harness';

const store = useHarnessStore();

// Derive unique project paths from all hooks (same pattern as SkillTab)
const projectPaths = computed(() => {
  const paths = new Set<string>();
  store.hooks.forEach(h => {
    if (h.scope === 'project' && h.projectPath) paths.add(h.projectPath);
  });
  return Array.from(paths);
});

function projLabel(path?: string): string {
  if (!path) return '未知專案';
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function hookTypeClass(hookType: 'PreToolUse' | 'PostToolUse' | 'Stop'): string {
  if (hookType === 'PreToolUse') return 'tag-pre';
  if (hookType === 'PostToolUse') return 'tag-post';
  return 'tag-stop';
}

function hookTypeDescription(hookType: 'PreToolUse' | 'PostToolUse' | 'Stop'): string {
  if (hookType === 'PreToolUse') return '在工具呼叫執行前觸發，可攔截或放行。';
  if (hookType === 'PostToolUse') return '在工具呼叫完成後觸發，可記錄或後處理。';
  return '在 Agent 停止時觸發，可做清理或通知。';
}

function formatMatcherJson(matcher: string): string {
  try {
    return JSON.stringify({ matcher }, null, 2);
  } catch {
    return matcher;
  }
}
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────── */
.hook-tab {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* ── Left Panel ──────────────────────────────────────────── */
.panel-left {
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  overflow: hidden;
}

/* Search Row */
.search-row {
  display: flex;
  gap: 6px;
  padding: 12px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-input:focus {
  border-color: var(--color-accent);
}

.project-filter {
  padding: 6px 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

/* Hook List */
.hook-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* List empty */
.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 24px;
  text-align: center;
}

.list-empty-icon {
  font-size: 32px;
  line-height: 1;
}

.list-empty-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.list-empty-sub {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* List Item */
.list-item {
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}

.list-item:hover {
  background: var(--color-bg-hover);
}

.list-item.is-selected {
  background: var(--color-bg-active);
  border-left-color: var(--color-accent);
}


.item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-matcher {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

/* ── Tags ───────────────────────────────────────────────── */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
}

/* Hook type tags */
.tag-pre {
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
}

.tag-post {
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
}

.tag-stop {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

/* Scope tags */
.tag-scope-global {
  background: rgba(108, 92, 231, 0.15);
  color: var(--color-accent-light);
}

.tag-scope-project {
  background: rgba(34, 211, 238, 0.12);
  color: var(--color-cyan);
}

/* ── Right Panel ─────────────────────────────────────────── */
.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* No Selection */
.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-muted);
}

.no-selection-icon {
  font-size: 40px;
  line-height: 1;
  opacity: 0.5;
}

.no-selection-title {
  font-size: 14px;
  color: var(--color-text-muted);
}

/* ── Detail View ─────────────────────────────────────────── */
.detail-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Detail Header */
.detail-header {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.detail-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.meta-matcher {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  padding: 2px 6px;
  border-radius: 4px;
}

.meta-status {
  font-size: 12px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 4px;
}

.status-enabled {
  background: var(--color-success-dim);
  color: var(--color-success);
}

.status-disabled {
  background: var(--color-danger-dim);
  color: var(--color-danger);
}

/* Detail Body */
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.md-h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 10px;
}

.md-h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 20px 0 8px;
}

.md-p {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 8px;
}

.md-divider {
  border: none;
  border-top: 1px solid var(--color-border-default);
  margin: 16px 0;
}

.md-section-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.md-block {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  padding: 12px 14px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0 0 8px;
}

.md-block-script {
  color: var(--color-text-primary);
}

.md-list {
  margin: 0 0 8px;
  padding-left: 20px;
}

.md-list li {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.8;
}

.md-list li code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  background: var(--color-bg-card);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--color-text-primary);
}

/* Detail Footer */
.detail-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-label {
  font-size: 12px;
  color: var(--color-text-muted);
  min-width: 72px;
}

.footer-value {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.footer-row code.footer-value {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
  background: var(--color-bg-card);
  padding: 1px 6px;
  border-radius: 3px;
}
</style>

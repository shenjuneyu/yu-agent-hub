<template>
  <div class="panel-right">
    <!-- No Selection State -->
    <div v-if="!skill" class="no-selection">
      <span class="no-sel-icon">🧩</span>
      <p class="no-sel-text">{{ t('harness.skill.selectPrompt') }}</p>
    </div>

    <!-- Selected Skill Detail — always preview -->
    <div v-else class="preview-wrap">
      <!-- Detail Header -->
      <div class="detail-header">
        <div class="detail-header-top">
          <div class="header-title-row">
            <h2 class="detail-title">{{ skill.name }}</h2>
            <span
              class="tag"
              :class="skill.source === 'system' ? 'tag-system' : 'tag-custom'"
            >{{ skill.source === 'system' ? 'System' : 'Custom' }}</span>
          </div>
          <div class="detail-meta-row">
            <span class="detail-path">{{ skill.path }}</span>
            <span class="detail-status is-enabled">
              <span class="status-dot"></span>
              {{ t('harness.skill.statusEnabled') }}
            </span>
          </div>
        </div>
      </div>

      <!-- Detail Body -->
      <div class="detail-body">
        <div v-if="skill.content" class="md-block">{{ skill.content }}</div>
        <p v-else class="md-p no-content-text">{{ t('harness.skill.noContent') }}</p>
      </div>

      <!-- Detail Footer -->
      <div class="detail-footer">
        <div class="footer-meta" v-if="skill.updatedAt">
          {{ t('harness.skill.updatedAt') }}<span class="footer-mono">{{ skill.updatedAt }}</span>
        </div>
        <div class="footer-meta" v-if="skill.fileSize !== undefined">
          {{ t('harness.skill.fileSize') }}<span class="footer-mono">{{ formatSize(skill.fileSize) }}</span>
        </div>
        <div class="footer-meta">
          {{ t('harness.skill.scope') }}<span class="footer-mono">{{ skill.scope === 'global' ? t('harness.skill.scopeGlobal') : projLabel(skill.projectPath) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { SkillItem } from '../../stores/harness';

const { t } = useI18n();

defineProps<{
  skill: SkillItem | null;
}>();

function projLabel(path?: string): string {
  if (!path) return t('harness.skill.unknownProject');
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
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

.md-p {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 0 0 10px;
}

.no-content-text {
  font-style: italic;
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
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTasksStore, type TaskRecord } from '../../stores/tasks';
import BaseTag from '../common/BaseTag.vue';

const { t } = useI18n();
const tasksStore = useTasksStore();

const task = computed<TaskRecord | null>(() => tasksStore.selectedTask);
const isOpen = computed(() => task.value !== null);

function close() {
  tasksStore.selectTask(null);
}

// --- Markdown body parsing ---

interface ParsedBody {
  description: string;
  acceptance: string;
  events: string;
}

function parseBody(raw: string): ParsedBody {
  const result: ParsedBody = { description: '', acceptance: '', events: '' };
  if (!raw) return result;

  // Split by ## headings
  const sections = raw.split(/^## /m);

  for (const section of sections) {
    const firstLine = section.split('\n')[0].trim();
    const body = section.slice(firstLine.length).trim();

    if (firstLine.startsWith('任務描述')) {
      result.description = body;
    } else if (firstLine.startsWith('驗收標準')) {
      result.acceptance = body;
    } else if (firstLine.startsWith('事件紀錄')) {
      result.events = body;
    }
  }

  return result;
}

const parsed = computed(() => parseBody(task.value?.description ?? ''));

// --- Event timeline parsing ---

interface TimelineEvent {
  heading: string;
  body: string;
}

function parseEvents(raw: string): TimelineEvent[] {
  if (!raw) return [];
  const items: TimelineEvent[] = [];
  const parts = raw.split(/^### /m);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline === -1) {
      items.push({ heading: trimmed, body: '' });
    } else {
      items.push({
        heading: trimmed.slice(0, firstNewline).trim(),
        body: trimmed.slice(firstNewline + 1).trim(),
      });
    }
  }
  return items;
}

const timeline = computed(() => parseEvents(parsed.value.events));

// --- Acceptance criteria parsing ---

interface CheckItem {
  checked: boolean;
  text: string;
}

function parseChecklist(raw: string): CheckItem[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter((line) => /^\s*-\s*\[[ x]\]/.test(line))
    .map((line) => ({
      checked: /\[x\]/i.test(line),
      text: line.replace(/^\s*-\s*\[[ x]\]\s*/i, '').trim(),
    }));
}

const checklist = computed(() => parseChecklist(parsed.value.acceptance));

// --- Priority / Status helpers ---

function priorityLabel(key: string): string {
  return t('taskboard.priorityLabels.' + key) || key;
}

const priorityColor: Record<string, 'red' | 'yellow' | 'blue' | 'purple'> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  critical: 'red',
  high: 'yellow',
  medium: 'blue',
  low: 'purple',
};

function statusLabel(key: string): string {
  return t('taskboard.columnLabels.' + key) || t('taskboard.statusLabels.' + key) || key;
}

const statusColor: Record<string, string> = {
  created: 'var(--color-text-muted)',
  assigned: 'var(--color-info)',
  in_progress: 'var(--color-warning)',
  in_review: 'var(--color-accent-light)',
  blocked: 'var(--color-danger)',
  rejected: 'var(--color-danger)',
  done: 'var(--color-success)',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
}
</script>

<template>
  <Transition name="slide">
    <div v-if="isOpen && task" class="detail-overlay" @click.self="close">
      <div class="detail-panel">
        <!-- Header -->
        <div class="panel-header">
          <div class="header-top">
            <span class="task-id">{{ task.id }}</span>
            <span
              class="status-badge"
              :style="{ background: statusColor[task.status] + '22', color: statusColor[task.status] }"
            >
              {{ statusLabel(task.status) }}
            </span>
            <div class="header-spacer"></div>
            <button class="close-btn" @click="close" :aria-label="$t('common.close')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <h2 class="task-title">{{ task.title }}</h2>
        </div>

        <!-- Scrollable body -->
        <div class="panel-body">
          <!-- Meta info grid -->
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.priority") }}</span>
              <BaseTag :color="priorityColor[task.priority]">
                {{ priorityLabel(task.priority) }}
              </BaseTag>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.assignedTo") }}</span>
              <span class="meta-value">{{ task.assignedTo ?? '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ $t('taskboard.detailPanel.sprint') }}</span>
              <span class="meta-value">{{ task.sprintName ?? '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.estimatedHours") }}</span>
              <span class="meta-value">{{ task.estimatedHours != null ? task.estimatedHours + 'h' : '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.actualHours") }}</span>
              <span class="meta-value">{{ task.actualHours != null ? task.actualHours + 'h' : '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.startedAt") }}</span>
              <span class="meta-value">{{ task.startedAt ? formatDate(task.startedAt) : '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.completedAt") }}</span>
              <span class="meta-value">{{ task.completedAt ? formatDate(task.completedAt) : '—' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">{{ t("taskboard.detailPanel.createdAt") }}</span>
              <span class="meta-value">{{ formatDate(task.createdAt) }}</span>
            </div>
          </div>

          <!-- Dependencies -->
          <div v-if="task.dependsOn.length > 0" class="section">
            <h3 class="section-title">{{ t("taskboard.detailPanel.dependencies") }}</h3>
            <div class="dep-list">
              <span v-for="dep in task.dependsOn" :key="dep" class="dep-chip">{{ dep }}</span>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="task.tags" class="section">
            <h3 class="section-title">{{ t("taskboard.detailPanel.tags") }}</h3>
            <div class="tag-list">
              <span
                v-for="tag in task.tags.split(',').map((t: string) => t.trim()).filter(Boolean)"
                :key="tag"
                class="extra-tag"
              >{{ tag }}</span>
            </div>
          </div>

          <!-- Description -->
          <div v-if="parsed.description" class="section">
            <h3 class="section-title">{{ t("taskboard.detailPanel.taskDescription") }}</h3>
            <div class="description-body">{{ parsed.description }}</div>
          </div>

          <!-- Acceptance criteria -->
          <div v-if="checklist.length > 0" class="section">
            <h3 class="section-title">{{ t("taskboard.detailPanel.acceptance") }}</h3>
            <ul class="checklist">
              <li v-for="(item, i) in checklist" :key="i" class="check-item">
                <span class="check-box" :class="{ 'check-box--done': item.checked }">
                  {{ item.checked ? '✓' : '' }}
                </span>
                <span class="check-text" :class="{ 'check-text--done': item.checked }">{{ item.text }}</span>
              </li>
            </ul>
          </div>

          <!-- Event timeline -->
          <div v-if="timeline.length > 0" class="section">
            <h3 class="section-title">{{ t("taskboard.detailPanel.events") }}</h3>
            <div class="timeline">
              <div v-for="(evt, i) in timeline" :key="i" class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <div class="timeline-heading">{{ evt.heading }}</div>
                  <div v-if="evt.body" class="timeline-body">{{ evt.body }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Overlay ── */
.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
  will-change: opacity;
}

/* ── Panel ── */
.detail-panel {
  width: 480px;
  max-width: 90vw;
  height: 100%;
  background: var(--color-bg-primary);
  border-left: 1px solid var(--color-border-default);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.3);
  will-change: transform;
  transform: translateZ(0);
}

/* ── Slide transition ── */
.slide-enter-active {
  transition: opacity 0.18s ease-out;
}
.slide-enter-active .detail-panel {
  transition: transform 0.18s ease-out;
}
.slide-leave-active {
  transition: opacity 0.12s ease-in;
}
.slide-leave-active .detail-panel {
  transition: transform 0.12s ease-in;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
.slide-enter-from .detail-panel,
.slide-leave-to .detail-panel {
  transform: translateX(100%);
}

/* ── Header ── */
.panel-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.task-id {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 12px;
}

.header-spacer {
  flex: 1;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.task-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.4;
  letter-spacing: -0.2px;
}

/* ── Scrollable body ── */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 40px;
}
.panel-body::-webkit-scrollbar {
  width: 5px;
}
.panel-body::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 3px;
}

/* ── Meta grid ── */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 20px;
  margin-bottom: 24px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-value {
  font-size: 13px;
  color: var(--color-text-primary);
}

/* ── Sections ── */
.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-default);
}

/* ── Dependencies ── */
.dep-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dep-chip {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border-default);
  padding: 3px 10px;
  border-radius: 6px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}

/* ── Tags ── */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.extra-tag {
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  padding: 3px 8px;
  border-radius: 4px;
}

/* ── Description ── */
.description-body {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Checklist ── */
.checklist {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.check-box {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--color-border-light);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  margin-top: 2px;
  color: transparent;
}

.check-box--done {
  background: var(--color-success);
  border-color: var(--color-success);
  color: #fff;
}

.check-text {
  font-size: 13px;
  color: var(--color-text-primary);
  line-height: 1.4;
}

.check-text--done {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

/* ── Timeline ── */
.timeline {
  position: relative;
  padding-left: 20px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 4px;
  bottom: 4px;
  width: 1.5px;
  background: var(--color-border-default);
}

.timeline-item {
  position: relative;
  margin-bottom: 16px;
}
.timeline-item:last-child {
  margin-bottom: 0;
}

.timeline-dot {
  position: absolute;
  left: -18px;
  top: 5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  border: 2px solid var(--color-bg-primary);
}

.timeline-content {
  min-height: 18px;
}

.timeline-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.timeline-body {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>

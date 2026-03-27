<script setup lang="ts">
import { computed } from 'vue';
import StatusDot from '../common/StatusDot.vue';
import SessionTerminal from './SessionTerminal.vue';
import type { ActiveSession } from '../../stores/sessions';
import { useTasksStore } from '../../stores/tasks';
import { formatTokens } from '../../utils/format-tokens';

const props = defineProps<{
  session: ActiveSession;
  selected?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  stop: [sessionId: string];
  remix: [session: ActiveSession];
  navigateToTask: [taskId: string];
  delegation: [session: ActiveSession];
  assignTask: [session: ActiveSession];
  requestSummary: [session: ActiveSession];
}>();

const tasksStore = useTasksStore();

const linkedTask = computed(() => {
  if (!props.session.taskId) return null;
  return tasksStore.tasks.find((t) => t.id === props.session.taskId) || null;
});

const statusLabel: Record<string, string> = {
  starting: '啟動中',
  running: '執行中',
  thinking: '思考中',
  executing_tool: '執行工具',
  awaiting_approval: '等待核准',
  waiting_input: '等待輸入',
  summarizing: '產生摘要中...',
  completed: '已完成',
  failed: '失敗',
  stopped: '已停止',
};

const statusDotMapping = computed(() => {
  const s = props.session.status;
  if (s === 'thinking' || s === 'starting') return 'thinking';
  if (s === 'running' || s === 'executing_tool') return 'running';
  if (s === 'summarizing') return 'thinking';
  if (s === 'failed') return 'error';
  if (s === 'completed' || s === 'stopped') return 'idle';
  return 'thinking';
});

const isSummarizing = computed(() => props.session.status === 'summarizing');

const formattedTokens = computed(() => {
  return formatTokens(props.session.inputTokens + props.session.outputTokens);
});

const formattedDuration = computed(() => {
  const ms = props.session.durationMs;
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
});

const isRunning = computed(() => {
  return !['completed', 'failed', 'stopped'].includes(props.session.status);
});
</script>

<template>
  <!-- ── List row (compact mode) ── -->
  <div
    v-if="compact"
    class="session-row"
    :class="[
      selected ? 'session-row--selected' : 'session-row--default',
    ]"
    @click="emit('select', session.sessionId)"
  >
    <!-- Status dot -->
    <StatusDot :status="statusDotMapping" class="session-row__status-dot" />

    <!-- Agent info -->
    <div class="session-row__info">
      <div class="session-row__agent-name">{{ session.agentName }}</div>
      <div class="session-row__task">{{ session.task }}</div>
    </div>

    <!-- Meta: linked task -->
    <span
      v-if="linkedTask"
      class="session-row__linked-task"
      @click.stop="emit('navigateToTask', linkedTask.id)"
    >
      {{ linkedTask.title }}
    </span>

    <!-- Model tag -->
    <span
      class="session-row__model-tag"
      :class="{
        'session-row__model-tag--haiku': session.model?.includes('haiku'),
        'session-row__model-tag--sonnet': session.model?.includes('sonnet'),
        'session-row__model-tag--opus': session.model?.includes('opus'),
        'session-row__model-tag--unknown': !session.model,
      }"
    >{{ session.model }}</span>

    <!-- Token + turns stats -->
    <div class="session-row__stats">
      <span class="session-row__stat-tokens">{{ formattedTokens }} tok</span>
      <span class="session-row__stat-turns">T{{ session.turnsCount }}</span>
    </div>

    <!-- Stop / Remix action -->
    <button
      v-if="isRunning"
      class="session-row__btn session-row__btn--stop"
      :title="isSummarizing ? '強制停止' : '停止'"
      @click.stop="emit('stop', session.sessionId)"
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
      <span v-if="isSummarizing" class="session-row__btn-label">強制</span>
    </button>
    <button
      v-if="!isRunning"
      class="session-row__btn session-row__btn--remix"
      title="重新執行"
      @click.stop="emit('remix', session)"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    </button>
  </div>

  <!-- ── Card (single / dual / triple grid modes) ── -->
  <div
    v-else
    class="session-card"
    :class="[
      selected ? 'session-card--selected' : 'session-card--default',
    ]"
    @click="emit('select', session.sessionId)"
  >
    <!-- Card header -->
    <div class="session-card__header">
      <StatusDot :status="statusDotMapping" class="session-card__status-dot" />
      <div class="session-card__header-info">
        <div class="session-card__agent-name">{{ session.agentName }}</div>
        <div class="session-card__task">{{ session.task }}</div>
      </div>
      <div class="session-card__actions">
        <!-- Model tag -->
        <span
          class="session-card__model-tag"
          :class="{
            'session-card__model-tag--haiku': session.model?.includes('haiku'),
            'session-card__model-tag--sonnet': session.model?.includes('sonnet'),
            'session-card__model-tag--opus': session.model?.includes('opus'),
            'session-card__model-tag--unknown': !session.model,
          }"
        >{{ session.model }}</span>
        <!-- Stop button -->
        <button
          v-if="isRunning"
          class="session-card__btn session-card__btn--stop"
          :title="isSummarizing ? '強制停止' : '停止'"
          @click.stop="emit('stop', session.sessionId)"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
          <span v-if="isSummarizing" class="session-card__btn-label">強制</span>
        </button>
        <!-- Remix button -->
        <button
          v-if="!isRunning"
          class="session-card__btn session-card__btn--remix"
          title="重新執行"
          @click.stop="emit('remix', session)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    </div>

    <!-- Linked task (if any) -->
    <div v-if="linkedTask" class="session-card__linked-task-bar">
      <span
        class="session-card__linked-task-link"
        @click.stop="emit('navigateToTask', linkedTask.id)"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        {{ linkedTask.title }}
      </span>
    </div>

    <!-- Terminal mini preview -->
    <div class="session-card__terminal">
      <SessionTerminal :pty-id="session.ptyId" :active="selected" />
    </div>

    <!-- Card footer -->
    <div class="session-card__footer">
      <!-- Stats -->
      <div class="session-card__stats">
        <span class="session-card__stat">
          <span class="session-card__stat-label">tok</span>
          <span class="session-card__stat-value">{{ formattedTokens }}</span>
        </span>
        <span class="session-card__stat">
          <span class="session-card__stat-label">T</span>
          <span class="session-card__stat-value">{{ session.turnsCount }}</span>
        </span>
        <span class="session-card__stat">
          <span class="session-card__stat-value">{{ formattedDuration }}</span>
        </span>
      </div>
      <!-- Action buttons -->
      <div v-if="session.projectId && isRunning" class="session-card__footer-actions">
        <button
          class="session-card__footer-btn session-card__footer-btn--accent"
          @click.stop="emit('delegation', session)"
        >
          傳送指令
        </button>
        <button
          class="session-card__footer-btn session-card__footer-btn--accent"
          @click.stop="emit('assignTask', session)"
        >
          指派任務
        </button>
      </div>
      <button
        class="session-card__footer-btn session-card__footer-btn--summary"
        :class="session.projectId && isRunning ? 'session-card__footer-btn--no-margin' : 'session-card__footer-btn--auto-margin'"
        title="手動觸發摘要"
        @click.stop="emit('requestSummary', session)"
      >
        摘要
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── Shared token resets ── */

/* ── Session Row (compact / list mode) ── */
.session-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}

.session-row--selected {
  border-color: var(--color-accent);
  background-color: var(--color-bg-active);
  box-shadow: 0 0 0 1px rgba(108, 92, 231, 0.2), 0 2px 8px rgba(108, 92, 231, 0.1);
}

.session-row--default {
  border-color: transparent;
  background-color: var(--color-bg-card);
}

.session-row--default:hover {
  border-color: var(--color-border-light);
  background-color: var(--color-bg-hover);
}

.session-row__status-dot {
  flex-shrink: 0;
}

.session-row__info {
  min-width: 0;
  flex: 1;
}

.session-row__agent-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.session-row__task {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-row__linked-task {
  flex-shrink: 0;
  max-width: 130px;
  cursor: pointer;
  font-size: 11px;
  color: var(--color-accent-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-row__linked-task:hover {
  text-decoration: underline;
}

.session-row__model-tag {
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.session-row__model-tag--haiku {
  background-color: rgba(0, 214, 143, 0.2);
  color: var(--color-success);
}

.session-row__model-tag--sonnet {
  background-color: rgba(51, 154, 240, 0.2);
  color: var(--color-info);
}

.session-row__model-tag--opus {
  background-color: rgba(255, 170, 0, 0.2);
  color: var(--color-warning);
}

.session-row__model-tag--unknown {
  background-color: var(--color-bg-hover);
  color: var(--color-text-muted);
}

.session-row__stats {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.session-row__stat-tokens {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.session-row__stat-turns {
  font-size: 10px;
  color: var(--color-text-muted);
}

.session-row__btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
  margin-left: 4px;
}

.session-row__btn--stop {
  gap: 4px;
  padding: 0 6px;
}

.session-row__btn--stop:hover {
  background-color: rgba(255, 107, 107, 0.2);
  color: var(--color-danger);
}

.session-row__btn--remix {
  width: 24px;
  padding: 0;
}

.session-row__btn--remix:hover {
  background-color: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.session-row__btn-label {
  font-size: 10px;
}

/* ── Session Card (grid modes) ── */
.session-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-card);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.session-card--selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px rgba(108, 92, 231, 0.2);
}

.session-card--default {
  border-color: var(--color-border-default);
}

.session-card--default:hover {
  border-color: var(--color-border-light);
}

.session-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
}

.session-card__status-dot {
  flex-shrink: 0;
}

.session-card__header-info {
  min-width: 0;
  flex: 1;
}

.session-card__agent-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.session-card__task {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.session-card__model-tag {
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.session-card__model-tag--haiku {
  background-color: rgba(0, 214, 143, 0.2);
  color: var(--color-success);
}

.session-card__model-tag--sonnet {
  background-color: rgba(51, 154, 240, 0.2);
  color: var(--color-info);
}

.session-card__model-tag--opus {
  background-color: rgba(255, 170, 0, 0.2);
  color: var(--color-warning);
}

.session-card__model-tag--unknown {
  background-color: var(--color-bg-hover);
  color: var(--color-text-muted);
}

.session-card__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.session-card__btn--stop {
  gap: 4px;
  padding: 0 6px;
}

.session-card__btn--stop:hover {
  background-color: rgba(255, 107, 107, 0.2);
  color: var(--color-danger);
}

.session-card__btn--remix {
  width: 24px;
  padding: 0;
}

.session-card__btn--remix:hover {
  background-color: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.session-card__btn-label {
  font-size: 10px;
}

.session-card__linked-task-bar {
  border-top: 1px solid var(--color-border-default);
  padding: 6px 14px;
}

.session-card__linked-task-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-accent-light);
  cursor: pointer;
}

.session-card__linked-task-link:hover {
  text-decoration: underline;
}

.session-card__terminal {
  min-height: 130px;
  flex: 1;
  background-color: #0a0b0f;
}

.session-card__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--color-border-default);
  padding: 8px 14px;
}

.session-card__stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.session-card__stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-card__stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  opacity: 0.6;
}

.session-card__stat-value {
  font-weight: 600;
  color: var(--color-text-secondary);
}

.session-card__footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.session-card__footer-btn {
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  transition: background-color 150ms ease;
}

.session-card__footer-btn--accent {
  border: 1px solid rgba(108, 92, 231, 0.3);
  background-color: rgba(108, 92, 231, 0.1);
  color: var(--color-accent-light);
}

.session-card__footer-btn--accent:hover {
  background-color: rgba(108, 92, 231, 0.2);
}

.session-card__footer-btn--summary {
  border: 1px solid var(--color-border-default);
  background: transparent;
  color: var(--color-text-muted);
}

.session-card__footer-btn--summary:hover {
  border-color: rgba(108, 92, 231, 0.4);
  color: var(--color-accent-light);
}

.session-card__footer-btn--auto-margin {
  margin-left: auto;
}

.session-card__footer-btn--no-margin {
  margin-left: 0;
}
</style>

<script lang="ts">
export default { name: 'SessionsView' };
</script>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue';
import {
  useSessionsStore,
  type LayoutMode,
  type ActiveSession,
  type SessionGroup,
  type ResumableSession,
} from '../stores/sessions';
import type { SessionGroupMode } from '../stores/ui';
import { useTasksStore } from '../stores/tasks';
import { useUiStore } from '../stores/ui';
import { useRouter, useRoute } from 'vue-router';
import { formatTokens } from '../utils/format-tokens';
import { useIpc } from '../composables/useIpc';
import BaseButton from '../components/common/BaseButton.vue';
import SessionGrid from '../components/session/SessionGrid.vue';
import SessionTerminal from '../components/session/SessionTerminal.vue';
import { type RemixData } from '../components/session/SessionLauncher.vue';
const SessionLauncher = defineAsyncComponent(() => import('../components/session/SessionLauncher.vue'));
const GateReviewBanner = defineAsyncComponent(() => import('../components/gate/GateReviewBanner.vue'));
import VirtualList from '../components/common/VirtualList.vue';

const sessionsStore = useSessionsStore();
const tasksStore = useTasksStore();
const uiStore = useUiStore();
const router = useRouter();
const route = useRoute();
const ipc = useIpc();

const scrollContainer = ref<HTMLElement | null>(null);
const collapsedGroups = ref<Set<string>>(new Set());

const groupOptions: { value: SessionGroupMode; label: string }[] = [
  { value: 'none', label: '不分組' },
  { value: 'project', label: '按專案' },
  { value: 'department', label: '按部門' },
];

function toggleGroupCollapse(key: string) {
  if (collapsedGroups.value.has(key)) {
    collapsedGroups.value.delete(key);
  } else {
    collapsedGroups.value.add(key);
  }
}

const showTaskAssigner = ref(false);
const assignTargetSession = ref<ActiveSession | null>(null);

const showDelegation = ref(false);
const delegationSource = ref<ActiveSession | null>(null);
const delegationInstruction = ref('');
const delegationTargetId = ref<string | null>(null);

type ViewTab = 'active' | 'history';
const activeViewTab = ref<ViewTab>('active');

const showLauncher = ref(false);
const remixData = ref<RemixData | null>(null);

// Auto-select session from query param (e.g. /sessions?id=xxx)
onMounted(() => {
  const queryId = route.query.id as string | undefined;
  if (queryId) {
    const active = sessionsStore.activeSessions.find((s) => s.sessionId === queryId);
    if (active) {
      sessionsStore.selectSession(queryId);
    }
  }
  // Restore scroll position
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = uiStore.getScrollPosition('/sessions');
    }
  });
});

onBeforeUnmount(() => {
  if (scrollContainer.value) {
    uiStore.saveScrollPosition('/sessions', scrollContainer.value.scrollTop);
  }
});

// Load resumable sessions when switching to history tab
watch(activeViewTab, (tab) => {
  if (tab === 'history') {
    sessionsStore.fetchResumable();
  }
});

function getTaskTitle(taskId: string | null): string | null {
  if (!taskId) return null;
  const task = tasksStore.tasks.find((t) => t.id === taskId);
  return task?.title || null;
}

function navigateToTask(taskId: string) {
  router.push(`/tasks/${taskId}`);
}

const layoutOptions: { value: LayoutMode; label: string; svg: string }[] = [
  { value: 'list', label: '清單', svg: '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2" rx="0.5"/><rect x="0" y="6" width="14" height="2" rx="0.5"/><rect x="0" y="11" width="14" height="2" rx="0.5"/></svg>' },
  { value: 'single', label: '單欄', svg: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/></svg>' },
  { value: 'dual', label: '雙欄', svg: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="5" height="12" rx="1"/><rect x="8" y="1" width="5" height="12" rx="1"/></svg>' },
  { value: 'triple', label: '三欄', svg: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="0.5" y="1" width="3.5" height="12" rx="1"/><rect x="5.25" y="1" width="3.5" height="12" rx="1"/><rect x="10" y="1" width="3.5" height="12" rx="1"/></svg>' },
];

const selectedSession = computed(() => sessionsStore.selectedSession);

function handleStop(sessionId: string) {
  const session = sessionsStore.activeSessions.find((s) => s.sessionId === sessionId);
  const force = session?.status === 'summarizing';
  sessionsStore.stop(sessionId, force);
}

function handleSelect(sessionId: string) {
  sessionsStore.selectSession(sessionId);
}

function handleLaunched() {
  showLauncher.value = false;
  remixData.value = null;
}

function handleRemix(session: ActiveSession) {
  remixData.value = {
    agentId: session.agentId,
    task: session.task,
    model: session.model as 'opus' | 'sonnet' | 'haiku',
  };
  showLauncher.value = true;
}

function openTaskAssigner(session: ActiveSession) {
  assignTargetSession.value = session;
  // Load tasks for the session's project
  if (session.projectId) {
    tasksStore.fetchTasks(session.projectId);
  }
  showTaskAssigner.value = true;
}

async function handleAssignTask(taskId: string) {
  if (!assignTargetSession.value) return;
  const task = tasksStore.tasks.find((t) => t.id === taskId);
  if (!task) return;
  try {
    await sessionsStore.assignTask(
      assignTargetSession.value.sessionId,
      taskId,
      task.title,
      task.description || task.title,
    );
  } catch (err) {
    console.error('Failed to assign task', err);
  }
  showTaskAssigner.value = false;
  assignTargetSession.value = null;
}

const assignableTasks = computed(() => {
  return tasksStore.tasks.filter((t) =>
    !['done', 'rejected'].includes(t.status),
  );
});

// --- Delegation ---
const delegationTargets = computed(() => {
  if (!delegationSource.value) return [];
  const src = delegationSource.value;
  return sessionsStore.activeSessions.filter(
    (s) => s.sessionId !== src.sessionId && s.projectId === src.projectId,
  );
});

function openDelegation(session: ActiveSession) {
  delegationSource.value = session;
  delegationInstruction.value = '';
  delegationTargetId.value = null;
  showDelegation.value = true;
}

async function handleSendDelegation() {
  if (!delegationSource.value || !delegationTargetId.value || !delegationInstruction.value.trim())
    return;
  try {
    await sessionsStore.sendDelegation(
      delegationSource.value.sessionId,
      delegationTargetId.value,
      delegationInstruction.value.trim(),
    );
  } catch (err) {
    console.error('Failed to send delegation', err);
  }
  showDelegation.value = false;
  delegationSource.value = null;
  delegationInstruction.value = '';
  delegationTargetId.value = null;
}

async function handleResumeConversation(item: ResumableSession) {
  try {
    await sessionsStore.resumeByConversationId(item);
    activeViewTab.value = 'active';
  } catch (err) {
    console.error('Failed to resume conversation', err);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function handleRequestSummary(session: ActiveSession) {
  try {
    const result = await ipc.requestSummary(session.sessionId);
    if (result) {
      uiStore.addToast(`${session.agentName} 的摘要已成功產生並儲存。`, 'success', '摘要已儲存');
    } else {
      uiStore.addToast('摘要間隔過短，請稍後再試。', 'info', '摘要跳過');
    }
  } catch (err) {
    uiStore.addToast(`無法產生 ${session.agentName} 的摘要。`, 'error', '摘要失敗');
  }
}
</script>

<template>
  <div class="sessions-view">

    <!-- ── Page Header ── -->
    <div class="sessions-header">
      <!-- Top row: title + controls -->
      <div class="sessions-header__top">
        <h1 class="sessions-header__title">工作階段</h1>

        <div class="sessions-header__actions">
          <!-- Gate Banner (compact, inline) -->
          <GateReviewBanner />

          <!-- Group mode pills (active tab only) -->
          <div
            v-if="activeViewTab === 'active'"
            class="sessions-pill-group"
          >
            <button
              v-for="opt in groupOptions"
              :key="opt.value"
              class="sessions-pill-group__item"
              :class="
                uiStore.sessionGroupMode === opt.value
                  ? 'sessions-pill-group__item--active'
                  : 'sessions-pill-group__item--inactive'
              "
              @click="uiStore.setSessionGroupMode(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Layout icon buttons (active tab only) -->
          <div
            v-if="activeViewTab === 'active'"
            class="sessions-layout-group"
          >
            <button
              v-for="opt in layoutOptions"
              :key="opt.value"
              class="sessions-layout-group__btn"
              :class="
                sessionsStore.layoutMode === opt.value
                  ? 'sessions-layout-group__btn--active'
                  : 'sessions-layout-group__btn--inactive'
              "
              :title="opt.label"
              @click="sessionsStore.setLayout(opt.value)"
              v-html="opt.svg"
            />
          </div>

          <!-- New Session button -->
          <BaseButton variant="primary" size="sm" @click="showLauncher = true">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" class="sessions-header__new-icon">
              <path d="M7 2v10M2 7h10"/>
            </svg>
            新增工作階段
          </BaseButton>
        </div>
      </div>

      <!-- Tab row -->
      <div class="sessions-tabs">
        <button
          class="sessions-tabs__item"
          :class="
            activeViewTab === 'active'
              ? 'sessions-tabs__item--active'
              : 'sessions-tabs__item--inactive'
          "
          @click="activeViewTab = 'active'"
        >
          執行中
          <span
            v-if="sessionsStore.activeCount > 0"
            class="sessions-tabs__badge"
          >{{ sessionsStore.activeCount }}</span>
        </button>
        <button
          class="sessions-tabs__item"
          :class="
            activeViewTab === 'history'
              ? 'sessions-tabs__item--active'
              : 'sessions-tabs__item--inactive'
          "
          @click="activeViewTab = 'history'"
        >
          歷史紀錄
          <span
            v-if="sessionsStore.resumableSessions.length > 0"
            class="sessions-tabs__count"
          >{{ sessionsStore.resumableSessions.length }}</span>
        </button>
      </div>
    </div>

    <!-- ===== Active sessions tab ===== -->
    <div v-if="activeViewTab === 'active'" class="sessions-body">

      <!-- Session list / grid panel -->
      <div
        ref="scrollContainer"
        class="sessions-scroll-panel"
      >
        <!-- Ungrouped view -->
        <template v-if="uiStore.sessionGroupMode === 'none'">
          <!-- Section header -->
          <div
            v-if="sessionsStore.activeSessions.length > 0"
            class="sessions-section-header"
          >
            執行中 — {{ sessionsStore.activeSessions.length }} 個工作階段
          </div>
          <SessionGrid
            :sessions="sessionsStore.activeSessions"
            :layout="sessionsStore.layoutMode"
            :selected-session-id="sessionsStore.selectedSessionId"
            @select="handleSelect"
            @stop="handleStop"
            @remix="handleRemix"
            @navigate-to-task="navigateToTask"
            @delegation="openDelegation"
            @assign-task="openTaskAssigner"
            @request-summary="handleRequestSummary"
          />
        </template>

        <!-- Grouped view -->
        <div v-else>
          <div
            v-for="group in sessionsStore.groupedSessions"
            :key="group.key"
            class="sessions-group"
          >
            <button
              class="sessions-group__header"
              @click="toggleGroupCollapse(group.key)"
            >
              <span
                class="sessions-group__chevron"
                :class="collapsedGroups.has(group.key) ? '' : 'sessions-group__chevron--open'"
              >&#9658;</span>
              <span class="sessions-group__label">{{ group.label }}</span>
              <span class="sessions-group__count">{{ group.sessions.length }}</span>
            </button>
            <SessionGrid
              v-show="!collapsedGroups.has(group.key)"
              :sessions="group.sessions"
              :layout="sessionsStore.layoutMode"
              :selected-session-id="sessionsStore.selectedSessionId"
              @select="handleSelect"
              @stop="handleStop"
              @remix="handleRemix"
              @navigate-to-task="navigateToTask"
              @delegation="openDelegation"
              @assign-task="openTaskAssigner"
              @request-summary="handleRequestSummary"
            />
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="sessionsStore.activeSessions.length === 0"
          class="sessions-empty"
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="sessions-empty__icon">
            <rect x="2" y="3" width="20" height="18" rx="2"/>
            <path d="M8 7h8M8 11h5"/>
          </svg>
          <p class="sessions-empty__title">尚無執行中的工作階段</p>
          <p class="sessions-empty__subtitle">啟動一個新的 Agent 工作階段開始工作</p>
          <button
            class="sessions-empty__action"
            @click="showLauncher = true"
          >
            啟動新的工作階段
          </button>
        </div>
      </div>

      <!-- ── Terminal Side Panel (list mode only) ── -->
      <div
        v-if="selectedSession && sessionsStore.layoutMode === 'list'"
        class="sessions-terminal-panel"
      >
        <!-- Terminal header -->
        <div class="sessions-terminal-panel__header">
          <div class="sessions-terminal-panel__header-info">
            <div class="sessions-terminal-panel__agent-row">
              <span
                class="sessions-terminal-panel__status-dot"
                :class="{
                  'sessions-terminal-panel__status-dot--running': selectedSession.status === 'running',
                  'sessions-terminal-panel__status-dot--thinking': selectedSession.status === 'thinking' || selectedSession.status === 'starting',
                  'sessions-terminal-panel__status-dot--tool': selectedSession.status === 'executing_tool',
                  'sessions-terminal-panel__status-dot--waiting': selectedSession.status === 'awaiting_approval' || selectedSession.status === 'waiting_input',
                  'sessions-terminal-panel__status-dot--idle': ['completed', 'failed', 'stopped'].includes(selectedSession.status),
                }"
              />
              {{ selectedSession.agentName }}
              <span
                class="sessions-terminal-panel__status-badge"
                :class="{
                  'sessions-terminal-panel__status-badge--running': selectedSession.status === 'running',
                  'sessions-terminal-panel__status-badge--thinking': ['thinking', 'starting', 'executing_tool'].includes(selectedSession.status),
                  'sessions-terminal-panel__status-badge--waiting': ['awaiting_approval', 'waiting_input'].includes(selectedSession.status),
                  'sessions-terminal-panel__status-badge--summarizing': selectedSession.status === 'summarizing',
                  'sessions-terminal-panel__status-badge--idle': ['completed', 'failed', 'stopped'].includes(selectedSession.status),
                }"
              >
                <span
                  v-if="['running', 'thinking', 'starting', 'summarizing'].includes(selectedSession.status)"
                  class="sessions-terminal-panel__status-pulse"
                />
                {{ { running: '執行中', thinking: '思考中', starting: '啟動中', executing_tool: '執行工具', awaiting_approval: '等待核准', waiting_input: '等待輸入', summarizing: '摘要中', completed: '已完成', failed: '失敗', stopped: '已停止' }[selectedSession.status] || selectedSession.status }}
              </span>
            </div>
            <div class="sessions-terminal-panel__task">{{ selectedSession.task }}</div>
          </div>
          <button
            class="sessions-terminal-panel__close-btn"
            @click="sessionsStore.selectSession(null)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 2l10 10M12 2L2 12"/>
            </svg>
          </button>
        </div>

        <!-- Terminal body -->
        <div class="sessions-terminal-panel__body">
          <SessionTerminal :key="selectedSession.ptyId" :pty-id="selectedSession.ptyId" :active="true" />
        </div>

        <!-- Terminal footer: stats + actions -->
        <div class="sessions-terminal-panel__footer">
          <!-- Stats row -->
          <div class="sessions-terminal-panel__stats">
            <div class="sessions-terminal-panel__stat">
              <span class="sessions-terminal-panel__stat-label">Token</span>
              <span class="sessions-terminal-panel__stat-value">{{ formatTokens(selectedSession.inputTokens + selectedSession.outputTokens) }}</span>
            </div>
            <div class="sessions-terminal-panel__stat">
              <span class="sessions-terminal-panel__stat-label">Turns</span>
              <span class="sessions-terminal-panel__stat-value">{{ selectedSession.turnsCount }}</span>
            </div>
            <div class="sessions-terminal-panel__stat">
              <span class="sessions-terminal-panel__stat-label">時長</span>
              <span class="sessions-terminal-panel__stat-value">{{ formatDuration(selectedSession.durationMs) }}</span>
            </div>
            <div class="sessions-terminal-panel__stat">
              <span class="sessions-terminal-panel__stat-label">次數</span>
              <span class="sessions-terminal-panel__stat-value">{{ selectedSession.turnsCount }} 次</span>
            </div>
          </div>
          <!-- Action buttons -->
          <div
            v-if="selectedSession.projectId && !['completed','failed','stopped'].includes(selectedSession.status)"
            class="sessions-terminal-panel__actions"
          >
            <button
              class="sessions-terminal-panel__action-btn"
              @click="openDelegation(selectedSession)"
            >
              傳送指令
            </button>
            <button
              class="sessions-terminal-panel__action-btn"
              @click="openTaskAssigner(selectedSession)"
            >
              指派任務
            </button>
            <button
              class="sessions-terminal-panel__action-btn sessions-terminal-panel__action-btn--primary"
              @click="handleRequestSummary(selectedSession)"
            >
              摘要報告
            </button>
          </div>
          <div v-else class="sessions-terminal-panel__actions">
            <button
              class="sessions-terminal-panel__action-btn"
              @click="handleRequestSummary(selectedSession)"
            >
              產生摘要
            </button>
            <button
              v-if="!['completed', 'failed', 'stopped'].includes(selectedSession.status)"
              class="sessions-terminal-panel__action-btn sessions-terminal-panel__action-btn--danger"
              @click="handleStop(selectedSession.sessionId)"
            >
              停止
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== History tab ===== -->
    <div v-if="activeViewTab === 'history'" class="sessions-body">
      <div class="history-scroll-panel">
        <!-- Empty state -->
        <div
          v-if="sessionsStore.resumableSessions.length === 0"
          class="sessions-empty"
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="sessions-empty__icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <p class="sessions-empty__title">尚無可繼續的工作階段</p>
          <p class="sessions-empty__subtitle">各專案工作目錄中的 Claude 對話將顯示於此</p>
        </div>

        <!-- History virtual list -->
        <VirtualList
          v-else
          :items="sessionsStore.resumableSessions"
          :item-height="56"
          class="history-virtual-list"
        >
          <template #default="{ item }: { item: any }">
            <div
              class="history-row history-row--default"
              style="height: 56px"
              @click="handleResumeConversation(item)"
            >
              <!-- Project name badge -->
              <span class="history-row__project-badge">
                {{ item.projectName }}
              </span>

              <!-- First message (task preview) -->
              <span class="history-row__task">{{ item.firstMessage }}</span>

              <!-- File size indicator -->
              <span class="history-row__size">
                {{ formatFileSize(item.fileSize) }}
              </span>

              <!-- Last modified time -->
              <span class="history-row__time">
                {{ formatTime(item.lastModified) }}
              </span>

              <!-- Resume button -->
              <button
                class="history-row__resume-btn"
                title="繼續此工作階段"
                @click.stop="handleResumeConversation(item)"
              >
                繼續
              </button>
            </div>
          </template>
        </VirtualList>
      </div>
    </div>

    <!-- ── Launcher Modal ── -->
    <SessionLauncher
      :show="showLauncher"
      :remix-data="remixData"
      @close="showLauncher = false; remixData = null"
      @launched="handleLaunched"
    />

    <!-- ── Task Assigner Modal ── -->
    <Teleport to="body">
      <div
        v-if="showTaskAssigner && assignTargetSession"
        class="modal-overlay"
        @click.self="showTaskAssigner = false"
      >
        <div class="modal-panel modal-panel--md">
          <!-- Modal header -->
          <div class="modal-header">
            <div class="modal-header__icon-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-light)" stroke-width="2">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </div>
            <div>
              <h3 class="modal-header__title">指派任務</h3>
              <p class="modal-header__subtitle">將任務指派給 {{ assignTargetSession.agentName }}</p>
            </div>
          </div>

          <div v-if="assignableTasks.length === 0" class="modal-empty-list">
            此專案沒有可指派的任務
          </div>
          <div v-else class="modal-scroll-list">
            <button
              v-for="task in assignableTasks"
              :key="task.id"
              class="task-picker-item"
              @click="handleAssignTask(task.id)"
            >
              <span
                class="task-picker-item__dot"
                :class="{
                  'task-picker-item__dot--created': task.status === 'created',
                  'task-picker-item__dot--assigned': task.status === 'assigned',
                  'task-picker-item__dot--in-progress': task.status === 'in_progress',
                  'task-picker-item__dot--in-review': task.status === 'in_review',
                  'task-picker-item__dot--blocked': task.status === 'blocked',
                }"
              />
              <div class="task-picker-item__info">
                <div class="task-picker-item__title">{{ task.title }}</div>
                <div v-if="task.description" class="task-picker-item__desc">
                  {{ task.description }}
                </div>
              </div>
              <span class="task-picker-item__status">{{ task.status }}</span>
            </button>
          </div>
          <div class="modal-footer modal-footer--end">
            <BaseButton variant="ghost" size="sm" @click="showTaskAssigner = false">
              取消
            </BaseButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Delegation Modal ── -->
    <Teleport to="body">
      <div
        v-if="showDelegation && delegationSource"
        class="modal-overlay"
        @click.self="showDelegation = false"
      >
        <div class="modal-panel modal-panel--lg">
          <!-- Modal header -->
          <div class="modal-header">
            <div class="modal-header__icon-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-light)" stroke-width="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </div>
            <div>
              <h3 class="modal-header__title">傳送指令給其他 Session</h3>
              <p class="modal-header__subtitle">
                從 <span class="modal-header__emphasis">{{ delegationSource.agentName }}</span> 傳送，完成後自動回傳結果
              </p>
            </div>
          </div>

          <!-- Target session picker -->
          <div class="modal-field">
            <label class="modal-field__label">選擇目標 Session</label>
            <div
              v-if="delegationTargets.length === 0"
              class="modal-empty-list"
            >
              同專案內沒有其他執行中的 Session
            </div>
            <div v-else class="modal-scroll-list modal-scroll-list--sm">
              <button
                v-for="target in delegationTargets"
                :key="target.sessionId"
                class="session-picker-item"
                :class="
                  delegationTargetId === target.sessionId
                    ? 'session-picker-item--selected'
                    : 'session-picker-item--default'
                "
                @click="delegationTargetId = target.sessionId"
              >
                <span
                  class="session-picker-item__dot"
                  :class="{
                    'session-picker-item__dot--running': target.status === 'running',
                    'session-picker-item__dot--thinking': target.status === 'thinking' || target.status === 'executing_tool',
                    'session-picker-item__dot--waiting': target.status === 'awaiting_approval',
                    'session-picker-item__dot--idle': !['running','thinking','executing_tool','awaiting_approval'].includes(target.status),
                  }"
                />
                <div class="session-picker-item__info">
                  <div class="session-picker-item__name">{{ target.agentName }}</div>
                  <div class="session-picker-item__task">{{ target.task }}</div>
                </div>
                <span class="session-picker-item__status">{{ target.status }}</span>
              </button>
            </div>
          </div>

          <!-- Instruction textarea -->
          <div class="modal-field">
            <label class="modal-field__label">指令內容</label>
            <textarea
              v-model="delegationInstruction"
              rows="3"
              class="modal-textarea"
              placeholder="例如：請幫我完成 login 頁面的 UI 實作..."
            />
          </div>

          <div class="modal-footer modal-footer--end">
            <BaseButton variant="ghost" size="sm" @click="showDelegation = false">
              取消
            </BaseButton>
            <BaseButton
              variant="primary"
              size="sm"
              :disabled="!delegationTargetId || !delegationInstruction.trim()"
              @click="handleSendDelegation"
            >
              傳送
            </BaseButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* =========================================================
   Sessions View — Root
   ========================================================= */
.sessions-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* =========================================================
   Page Header
   ========================================================= */
.sessions-header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-base, var(--color-bg-primary));
  padding: 0 24px;
}

.sessions-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  padding-bottom: 0;
}

.sessions-header__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.3px;
  color: var(--color-text-primary);
}

.sessions-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sessions-header__new-icon {
  margin-right: 4px;
}

/* ── Pill group (group mode selector) ── */
.sessions-pill-group {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-card);
  padding: 3px;
}

.sessions-pill-group__item {
  cursor: pointer;
  border-radius: 5px;
  border: none;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
  font-family: inherit;
}

.sessions-pill-group__item--active {
  background: var(--color-accent);
  color: #fff;
}

.sessions-pill-group__item--inactive {
  background: transparent;
  color: var(--color-text-secondary);
}

.sessions-pill-group__item--inactive:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* ── Layout icon-button group ── */
.sessions-layout-group {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-card);
  padding: 3px;
}

.sessions-layout-group__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  cursor: pointer;
  border-radius: 5px;
  border: none;
  transition: all 0.15s;
  font-family: inherit;
}

.sessions-layout-group__btn--active {
  background: var(--color-bg-active);
  color: var(--color-accent-light);
}

.sessions-layout-group__btn--inactive {
  background: transparent;
  color: var(--color-text-muted);
}

.sessions-layout-group__btn--inactive:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

/* ── Tabs ── */
.sessions-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 4px;
}

.sessions-tabs__item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  transition: all 0.15s;
  margin-bottom: -1px;
}

.sessions-tabs__item--active {
  border-bottom-color: var(--color-accent);
  color: var(--color-accent-light);
}

.sessions-tabs__item--inactive {
  color: var(--color-text-muted);
}

.sessions-tabs__item--inactive:hover {
  color: var(--color-text-secondary);
}

.sessions-tabs__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 9999px;
  background: var(--color-accent);
  font-size: 10px;
  font-weight: 700;
  color: #fff;
}

.sessions-tabs__count {
  font-size: 10px;
  color: var(--color-text-muted);
}

/* =========================================================
   Body (shared by active + history tabs)
   ========================================================= */
.sessions-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* =========================================================
   Session Scroll Panel (active tab)
   ========================================================= */
.sessions-scroll-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 12px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-default) transparent;
}

.sessions-scroll-panel::-webkit-scrollbar {
  width: 4px;
}

.sessions-scroll-panel::-webkit-scrollbar-track {
  background: transparent;
}

.sessions-scroll-panel::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 2px;
}

/* ── Section header ── */
.sessions-section-header {
  margin-bottom: 8px;
  padding: 0 14px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-text-muted);
}

/* ── Group view ── */
.sessions-group {
  margin-bottom: 16px;
}

.sessions-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  cursor: pointer;
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  padding: 6px 8px;
  text-align: left;
  margin-bottom: 8px;
  transition: background 0.15s;
  font-family: inherit;
}

.sessions-group__header:hover {
  background: var(--color-bg-card);
}

.sessions-group__chevron {
  display: inline-block;
  width: 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  transition: transform 0.15s;
}

.sessions-group__chevron--open {
  transform: rotate(90deg);
}

.sessions-group__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sessions-group__count {
  border-radius: 9999px;
  background: var(--color-bg-hover);
  padding: 2px 7px;
  font-size: 10px;
  color: var(--color-text-muted);
}

/* ── Empty state ── */
.sessions-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--color-text-muted);
}

.sessions-empty__icon {
  margin-bottom: 12px;
  opacity: 0.25;
}

.sessions-empty__title {
  margin-bottom: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.sessions-empty__subtitle {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.sessions-empty__action {
  cursor: pointer;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-accent-light);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  transition: color 0.15s;
}

.sessions-empty__action:hover {
  color: var(--color-accent);
}

/* =========================================================
   Terminal Side Panel
   ========================================================= */
.sessions-terminal-panel {
  display: flex;
  flex-direction: column;
  width: 480px;
  min-width: 480px;
  overflow: hidden;
  border-left: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary, var(--color-bg-card));
  scrollbar-width: thin;
}

.sessions-terminal-panel__header {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-default);
  padding: 12px 16px;
}

.sessions-terminal-panel__header-info {
  flex: 1;
  min-width: 0;
}

.sessions-terminal-panel__agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.sessions-terminal-panel__task {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status dot in terminal header */
.sessions-terminal-panel__status-dot {
  display: inline-block;
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.sessions-terminal-panel__status-dot--running {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
  animation: pulse-dot 1.4s ease-in-out infinite;
}

.sessions-terminal-panel__status-dot--thinking {
  background: var(--color-accent);
  box-shadow: 0 0 6px var(--color-accent);
  animation: pulse-dot 1.4s ease-in-out infinite;
}

.sessions-terminal-panel__status-dot--tool {
  background: var(--color-accent-light);
}

.sessions-terminal-panel__status-dot--waiting {
  background: var(--color-warning);
}

.sessions-terminal-panel__status-dot--idle {
  background: var(--color-text-muted);
}

/* Status badge pill */
.sessions-terminal-panel__status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
}

.sessions-terminal-panel__status-badge--running {
  background: rgba(0, 214, 143, 0.2);
  color: var(--color-success);
}

.sessions-terminal-panel__status-badge--thinking {
  background: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.sessions-terminal-panel__status-badge--waiting {
  background: rgba(255, 170, 0, 0.2);
  color: var(--color-warning);
}

.sessions-terminal-panel__status-badge--summarizing {
  background: rgba(51, 154, 240, 0.2);
  color: var(--color-info);
}

.sessions-terminal-panel__status-badge--idle {
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
}

.sessions-terminal-panel__status-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse-dot 1.4s ease-in-out infinite;
}

/* Close button */
.sessions-terminal-panel__close-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: 8px;
  cursor: pointer;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--color-text-muted);
  transition: background 0.15s, color 0.15s;
}

.sessions-terminal-panel__close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* Terminal body */
.sessions-terminal-panel__body {
  flex: 1;
  min-height: 0;
  background: #0a0b0f;
}

/* Terminal footer */
.sessions-terminal-panel__footer {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border-default);
  padding: 12px 16px;
}

.sessions-terminal-panel__stats {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}

.sessions-terminal-panel__stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sessions-terminal-panel__stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
}

.sessions-terminal-panel__stat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sessions-terminal-panel__actions {
  display: flex;
  gap: 8px;
}

.sessions-terminal-panel__action-btn {
  flex: 1;
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-hover);
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--color-text-secondary);
  transition: all 0.15s;
}

.sessions-terminal-panel__action-btn:hover {
  background: var(--color-bg-active);
  color: var(--color-text-primary);
}

.sessions-terminal-panel__action-btn--primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}

.sessions-terminal-panel__action-btn--primary:hover {
  background: var(--color-accent-light);
  border-color: var(--color-accent-light);
  color: #fff;
}

.sessions-terminal-panel__action-btn--danger {
  border-color: rgba(255, 107, 107, 0.3);
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-error, var(--color-danger, #ff6b6b));
}

.sessions-terminal-panel__action-btn--danger:hover {
  background: rgba(255, 107, 107, 0.2);
}

/* =========================================================
   History Scroll Panel
   ========================================================= */
.history-scroll-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-default) transparent;
}

.history-scroll-panel::-webkit-scrollbar {
  width: 4px;
}

.history-scroll-panel::-webkit-scrollbar-track {
  background: transparent;
}

.history-scroll-panel::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 2px;
}

/* ── History row ── */
.history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  padding: 0 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.history-row--default:hover {
  border-color: var(--color-border-default);
  background: var(--color-bg-card);
}

.history-row__project-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(108, 92, 231, 0.15);
  color: var(--color-accent-light);
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-row__task {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.history-row__size {
  flex-shrink: 0;
  width: 60px;
  text-align: right;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--color-text-muted);
}

.history-row__time {
  flex-shrink: 0;
  width: 90px;
  text-align: right;
  font-size: 11px;
  color: var(--color-text-muted);
}

.history-row__resume-btn {
  flex-shrink: 0;
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid rgba(108, 92, 231, 0.3);
  background: rgba(108, 92, 231, 0.15);
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  font-family: inherit;
  color: var(--color-accent-light);
  transition: background 0.15s;
}

.history-row__resume-btn:hover {
  background: rgba(108, 92, 231, 0.25);
}

/* =========================================================
   Modal — shared overlay + panel
   ========================================================= */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal-panel {
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-card);
  padding: 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

.modal-panel--md {
  width: 480px;
}

.modal-panel--lg {
  width: 520px;
}

/* Modal header */
.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.modal-header__icon-wrap {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md, 8px);
  background: rgba(108, 92, 231, 0.2);
}

.modal-header__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.modal-header__subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.modal-header__emphasis {
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Modal field (label + control) */
.modal-field {
  margin-bottom: 16px;
}

.modal-field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--color-text-secondary);
}

/* Empty list placeholder */
.modal-empty-list {
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary, var(--color-bg-card));
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Scrollable list inside modal */
.modal-scroll-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-scroll-list--sm {
  max-height: 180px;
}

/* Modal footer */
.modal-footer {
  display: flex;
  margin-top: 20px;
}

.modal-footer--end {
  justify-content: flex-end;
  gap: 8px;
}

/* Modal textarea */
.modal-textarea {
  width: 100%;
  resize: vertical;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary, var(--color-bg-card));
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.modal-textarea::placeholder {
  color: rgba(92, 94, 114, 0.5);
}

.modal-textarea:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.15);
}

/* =========================================================
   Task Picker (inside task assigner modal)
   ========================================================= */
.task-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary, var(--color-bg-card));
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.15s;
}

.task-picker-item:hover {
  border-color: rgba(108, 92, 231, 0.4);
  background: var(--color-bg-hover);
}

.task-picker-item__dot {
  display: inline-block;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.task-picker-item__dot--created {
  background: var(--color-text-muted);
}

.task-picker-item__dot--assigned {
  background: var(--color-info);
}

.task-picker-item__dot--in-progress {
  background: var(--color-warning);
}

.task-picker-item__dot--in-review {
  background: var(--color-accent);
}

.task-picker-item__dot--blocked {
  background: var(--color-error, var(--color-danger, #ff6b6b));
}

.task-picker-item__info {
  flex: 1;
  min-width: 0;
}

.task-picker-item__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--color-text-primary);
}

.task-picker-item__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-muted);
}

.task-picker-item__status {
  flex-shrink: 0;
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

/* =========================================================
   Session Picker (inside delegation modal)
   ========================================================= */
.session-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary, var(--color-bg-card));
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.15s;
}

.session-picker-item--selected {
  border-color: var(--color-accent);
  background: rgba(108, 92, 231, 0.1);
}

.session-picker-item--default:hover {
  border-color: rgba(108, 92, 231, 0.4);
  background: var(--color-bg-hover);
}

.session-picker-item__dot {
  display: inline-block;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.session-picker-item__dot--running {
  background: var(--color-success);
}

.session-picker-item__dot--thinking {
  background: var(--color-accent);
}

.session-picker-item__dot--waiting {
  background: var(--color-warning);
}

.session-picker-item__dot--idle {
  background: var(--color-text-muted);
}

.session-picker-item__info {
  flex: 1;
  min-width: 0;
}

.session-picker-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--color-text-primary);
}

.session-picker-item__task {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-muted);
}

.session-picker-item__status {
  flex-shrink: 0;
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

/* VirtualList full height inside history panel */
.history-virtual-list {
  height: 100%;
}

/* =========================================================
   Keyframe animations
   ========================================================= */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
</style>

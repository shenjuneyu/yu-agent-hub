<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useIpc } from '../composables/useIpc';
import { useSessionsStore } from '../stores/sessions';
import { useAgentsStore } from '../stores/agents';
import { useProjectsStore } from '../stores/projects';
import { useTasksStore } from '../stores/tasks';
import { useGatesStore } from '../stores/gates';
import { formatTokens } from '../utils/format-tokens';
import StatCard from '../components/common/StatCard.vue';
import StatusDot from '../components/common/StatusDot.vue';
import BaseTag from '../components/common/BaseTag.vue';
import ProgressBar from '../components/common/ProgressBar.vue';

const router = useRouter();
const { getHealth, listSprints, getPitfallOverdue } = useIpc();
const sessionsStore = useSessionsStore();
const agentsStore = useAgentsStore();
const projectsStore = useProjectsStore();
const tasksStore = useTasksStore();
const gatesStore = useGatesStore();

const health = ref<Record<string, unknown> | null>(null);

// 逾期踩坑提醒
interface OverduePitfall {
  project: string;
  title: string;
  category: string;
  dueDate: string;
  daysOverdue: number;
  problem: string;
}
const overduePitfalls = ref<OverduePitfall[]>([]);

// 儀表板用：所有專案的 sprints 加總
import type { SprintRecord } from '../stores/projects';
const allSprints = ref<SprintRecord[]>([]);

onMounted(async () => {
  try {
    health.value = await getHealth();
  } catch (e) {
    console.error('Failed to get health', e);
  }

  try {
    overduePitfalls.value = await getPitfallOverdue();
  } catch (e) {
    console.error('Failed to get overdue pitfalls', e);
  }
  if (projectsStore.projects.length === 0) await projectsStore.fetchAll();

  // 載入所有專案的 sprints
  const sprintResults = await Promise.all(
    projectsStore.projects.map((p) => listSprints(p.id).catch(() => [])),
  );
  allSprints.value = sprintResults.flat() as SprintRecord[];

  // Gates: 全部專案（無 filter）
  await gatesStore.fetchGates();

  // Tasks: 用第一個專案的 active sprint 做預覽
  if (projectsStore.projects.length > 0) {
    const firstProject = projectsStore.projects[0];
    await projectsStore.selectProject(firstProject.id);
    const firstActiveSprint = projectsStore.activeSprint;
    tasksStore.setContext(firstProject.id, firstActiveSprint?.id ?? null);
    await tasksStore.fetchTasks();
  }
});


const activeSprints = computed(() =>
  allSprints.value.filter((s) => s.status === 'active'),
);

const sprintGateProgress = computed(() => {
  const map: Record<string, { approved: number; total: number; pct: number }> = {};
  for (const sprint of activeSprints.value) {
    const gates = gatesStore.gates.filter((g) => g.sprintId === sprint.id);
    const approved = gates.filter((g) => g.status === 'approved').length;
    const total = gates.length || 6;
    map[sprint.id] = { approved, total, pct: Math.round((approved / total) * 100) };
  }
  return map;
});

const statusLabel: Record<string, string> = {
  starting: '啟動中',
  running: '執行中',
  thinking: '思考中',
  executing_tool: '執行工具',
  awaiting_approval: '等待核准',
  waiting_input: '等待輸入',
  completed: '已完成',
  failed: '失敗',
  stopped: '已停止',
};

const gateTypeLabel: Record<string, string> = {
  G0: '需求確認',
  G1: '圖稿審核',
  G2: '程式碼審查',
  G3: '測試驗收',
  G4: '文件審查',
  G5: '部署就緒',
  G6: '正式發佈',
};

const pendingTasks = computed(() =>
  tasksStore.tasks
    .filter((t) => ['created', 'assigned', 'in_progress', 'in_review', 'blocked'].includes(t.status))
    .slice(0, 5),
);

const taskStatusLabel: Record<string, string> = {
  created: '待處理',
  assigned: '已分配',
  in_progress: '進行中',
  in_review: '審查中',
  blocked: '阻塞',
  rejected: '已退回',
  done: '完成',
};

const taskStatusColor: Record<string, 'purple' | 'blue' | 'yellow' | 'green' | 'red'> = {
  created: 'purple',
  assigned: 'blue',
  in_progress: 'yellow',
  in_review: 'blue',
  blocked: 'red',
  rejected: 'red',
  done: 'green',
};
</script>

<template>
  <div class="dashboard">
    <!-- ── Stat Cards Row ─────────────────────────────────────── -->
    <div class="stat-row">
      <StatCard
        label="代理人"
        :value="agentsStore.agentCount"
      />
      <StatCard
        label="執行中"
        :value="sessionsStore.activeCount"
        :change="sessionsStore.activeCount > 0 ? '運行中' : undefined"
        change-color="green"
      />
      <StatCard
        label="專案"
        :value="projectsStore.projectCount"
        :change="projectsStore.activeProjects.length > 0 ? `${projectsStore.activeProjects.length} 進行中` : undefined"
        change-color="blue"
      />
      <StatCard
        label="今日用量"
        value="—"
        change-color="muted"
      />
    </div>

    <!-- ── 逾期踩坑提醒 ────────────────────────────────────────── -->
    <section v-if="overduePitfalls.length > 0" class="pitfall-alert-section">
      <div class="section-header danger">
        <span class="section-icon">⚠️</span>
        <h2>逾期踩坑提醒</h2>
        <span class="badge danger">{{ overduePitfalls.length }}</span>
      </div>
      <div class="pitfall-cards">
        <div
          v-for="pitfall in overduePitfalls"
          :key="`${pitfall.project}-${pitfall.title}`"
          class="pitfall-card"
        >
          <div class="pitfall-header">
            <span class="pitfall-project">{{ pitfall.project }}</span>
            <span class="pitfall-overdue">逾期 {{ pitfall.daysOverdue }} 天</span>
          </div>
          <div class="pitfall-title">{{ pitfall.title }}</div>
          <div class="pitfall-meta">
            <span class="pitfall-category">{{ pitfall.category }}</span>
            <span class="pitfall-due">到期: {{ pitfall.dueDate }}</span>
          </div>
          <div v-if="pitfall.problem" class="pitfall-problem">{{ pitfall.problem }}</div>
        </div>
      </div>
    </section>

    <!-- ── Main Grid ───────────────────────────────────────────── -->
    <div class="main-grid">

      <!-- Left Column -->
      <div class="col">

        <!-- Active Sprints -->
        <div class="section-card">
          <div class="card-header">
            <h3 class="card-title">進行中 Sprint</h3>
            <button class="card-link" @click="router.push({ name: 'projects' })">查看全部</button>
          </div>

          <div v-if="activeSprints.length === 0" class="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span class="empty-title">無進行中的 Sprint</span>
          </div>

          <div v-else class="sprint-list">
            <div
              v-for="sprint in activeSprints"
              :key="sprint.id"
              class="sprint-item"
              @click="router.push({ name: 'project-detail', params: { id: sprint.projectId } })"
            >
              <div class="sprint-row">
                <span class="sprint-name">{{ sprint.name }}</span>
                <span v-if="sprintGateProgress[sprint.id]" class="sprint-gates">
                  {{ sprintGateProgress[sprint.id].approved }} / {{ sprintGateProgress[sprint.id].total }} 關卡
                </span>
              </div>
              <div v-if="sprint.goal" class="sprint-goal">{{ sprint.goal }}</div>
              <ProgressBar
                :value="sprintGateProgress[sprint.id]?.pct ?? 0"
                color="bg-success"
              />
            </div>
          </div>
        </div>

        <!-- Pending Tasks -->
        <div class="section-card">
          <div class="card-header">
            <h3 class="card-title">待處理任務</h3>
            <button class="card-link" @click="router.push({ name: 'tasks' })">查看全部</button>
          </div>

          <div v-if="pendingTasks.length === 0" class="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            <span class="empty-title">無待處理任務</span>
          </div>

          <div v-else class="task-list">
            <div
              v-for="task in pendingTasks"
              :key="task.id"
              class="task-item"
            >
              <span
                class="priority-dot"
                :class="{
                  'priority-critical': task.priority === 'critical',
                  'priority-high':     task.priority === 'high',
                  'priority-medium':   task.priority === 'medium',
                  'priority-low':      task.priority === 'low',
                }"
              />
              <span class="task-name">{{ task.title }}</span>
              <BaseTag :color="taskStatusColor[task.status]">
                {{ taskStatusLabel[task.status] }}
              </BaseTag>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="section-card">
          <div class="card-header">
            <h3 class="card-title">最近活動</h3>
            <button class="card-link" @click="router.push({ name: 'sessions' })">查看全部</button>
          </div>

          <div v-if="sessionsStore.history.length === 0" class="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span class="empty-title">尚無歷史紀錄</span>
          </div>

          <div v-else class="activity-list">
            <div
              v-for="record in sessionsStore.history.slice(0, 5)"
              :key="record.id"
              class="activity-item"
            >
              <span
                class="activity-dot"
                :class="{
                  'dot-success': record.status === 'completed',
                  'dot-danger':  record.status === 'failed',
                  'dot-muted':   record.status === 'stopped',
                  'dot-info':    record.status === 'running',
                }"
              />
              <span class="activity-agent">{{ record.agent_id }}</span>
              <span class="activity-desc">{{ record.task }}</span>
              <span class="activity-tokens">{{ formatTokens((record.input_tokens || 0) + (record.output_tokens || 0)) }} tok</span>
            </div>
          </div>
        </div>

      </div><!-- /left col -->

      <!-- Right Column -->
      <div class="col">

        <!-- Active Sessions -->
        <div class="section-card">
          <div class="card-header">
            <h3 class="card-title">活躍工作階段</h3>
            <button class="card-link" @click="router.push({ name: 'sessions' })">查看全部</button>
          </div>

          <div v-if="sessionsStore.activeSessions.length === 0" class="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
              <circle cx="12" cy="12" r="3"/><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span class="empty-title">尚無執行中的工作階段</span>
          </div>

          <div v-else class="session-list">
            <div
              v-for="session in sessionsStore.activeSessions"
              :key="session.sessionId"
              class="session-item"
              @click="router.push({ name: 'sessions' })"
            >
              <StatusDot
                :status="
                  session.status === 'thinking' || session.status === 'starting'
                    ? 'thinking'
                    : session.status === 'executing_tool'
                      ? 'running'
                      : session.status === 'failed'
                        ? 'error'
                        : 'idle'
                "
              />
              <div class="session-body">
                <div class="session-agent">{{ session.agentName }}</div>
                <div class="session-task">{{ session.task }}</div>
              </div>
              <div class="session-meta">
                <div
                  class="session-state"
                  :class="{
                    'state-running':  session.status === 'running' || session.status === 'executing_tool',
                    'state-thinking': session.status === 'thinking' || session.status === 'starting',
                    'state-muted':    session.status !== 'running' && session.status !== 'executing_tool' && session.status !== 'thinking' && session.status !== 'starting',
                  }"
                >
                  {{ statusLabel[session.status] || session.status }}
                </div>
                <div class="session-tok">{{ formatTokens(session.inputTokens + session.outputTokens) }} tok</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Gate Status -->
        <div class="section-card">
          <div class="card-header">
            <h3 class="card-title">審核關卡</h3>
            <button class="card-link" @click="router.push({ name: 'gates' })">查看全部</button>
          </div>

          <!-- Pending alert banner -->
          <div v-if="gatesStore.pendingCount > 0" class="gate-alert">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ gatesStore.pendingCount }} 個待處理關卡需要確認
          </div>
          <div v-else class="gates-all-clear">所有關卡已通過</div>

          <!-- Gate items -->
          <div v-if="gatesStore.actionableGates.length > 0" class="gate-list">
            <div
              v-for="gate in gatesStore.actionableGates.slice(0, 4)"
              :key="gate.id"
              class="gate-item"
              @click="router.push({ name: 'project-detail', params: { id: gate.projectId } })"
            >
              <span class="gate-type">{{ gate.gateType }}</span>
              <span class="gate-type-name">{{ gateTypeLabel[gate.gateType] || gate.gateType }}</span>
              <span class="gate-project">{{ gate.sprintName || gate.projectName }}</span>
              <BaseTag
                :color="gate.status === 'rejected' ? 'red' : gate.status === 'submitted' ? 'blue' : 'yellow'"
              >
                {{ gate.status === 'pending' ? '待處理' : gate.status === 'submitted' ? '已提交' : '已退回' }}
              </BaseTag>
            </div>
          </div>

          <div v-else-if="gatesStore.pendingCount === 0" class="empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span class="empty-title">暫無待審關卡</span>
          </div>
        </div>

      </div><!-- /right col -->
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────── */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Section Card ────────────────────────────────────────────── */
.section-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  padding: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-link {
  font-size: 12px;
  color: var(--color-accent-light);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: text-decoration 0.1s;
}

.card-link:hover {
  text-decoration: underline;
}

/* ── Empty State ─────────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  gap: 8px;
}

.empty-icon {
  opacity: 0.3;
  color: var(--color-text-muted);
}

.empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

/* ── Sprint List ─────────────────────────────────────────────── */
.sprint-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sprint-item {
  cursor: pointer;
}

.sprint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.sprint-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.sprint-gates {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.sprint-goal {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
}

/* ── Task List ───────────────────────────────────────────────── */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  transition: background 0.12s;
}

.task-item:hover {
  background: var(--color-bg-hover);
}

.priority-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.priority-critical { background: var(--color-danger); }
.priority-high     { background: var(--color-warning); }
.priority-medium   { background: var(--color-info); }
.priority-low      { background: var(--color-text-muted); }

.task-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Activity List ───────────────────────────────────────────── */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 8px;
  transition: background 0.12s;
}

.activity-item:hover {
  background: var(--color-bg-hover);
}

.activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-success { background: var(--color-success); }
.dot-danger  { background: var(--color-danger); }
.dot-muted   { background: var(--color-text-muted); }
.dot-info    { background: var(--color-info); }

.activity-agent {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  min-width: 140px;
}

.activity-desc {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-tokens {
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Session List ────────────────────────────────────────────── */
.session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-primary);
  cursor: pointer;
  transition: border-color 0.15s;
}

.session-item:hover {
  border-color: var(--color-border-light);
}

.session-body {
  flex: 1;
  min-width: 0;
}

.session-agent {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.session-task {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  text-align: right;
  flex-shrink: 0;
}

.session-state {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 2px;
}

.state-running  { color: var(--color-success); }
.state-thinking { color: var(--color-accent-light); }
.state-muted    { color: var(--color-text-muted); }

.session-tok {
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

/* ── Gate Section ────────────────────────────────────────────── */
.gate-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-warning-dim);
  border: 1px solid #ffaa0055;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-warning);
}

.gates-all-clear {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}

.gate-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gate-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}

.gate-item:hover {
  background: var(--color-bg-hover);
}

.gate-type {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-accent-light);
  min-width: 26px;
}

.gate-type-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 60px;
}

.gate-project {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Pitfall Alert Section ───────────────────────────────────── */
.pitfall-alert-section {
  margin-bottom: 24px;
}

.section-header.danger {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--color-danger, #ff6b6b);
}

.section-header.danger h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--color-danger, #ff6b6b);
}

.badge.danger {
  background: var(--color-danger, #ff6b6b);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.pitfall-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.pitfall-card {
  background: var(--color-bg-card, #1c1e2e);
  border: 1px solid var(--color-danger, #ff6b6b);
  border-left: 4px solid var(--color-danger, #ff6b6b);
  border-radius: 8px;
  padding: 12px 16px;
}

.pitfall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.pitfall-project {
  font-size: 12px;
  color: var(--color-text-secondary, #8b8da3);
  font-weight: 500;
}

.pitfall-overdue {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-danger, #ff6b6b);
}

.pitfall-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #e4e4f0);
  margin-bottom: 8px;
}

.pitfall-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #8b8da3);
  margin-bottom: 4px;
}

.pitfall-category {
  background: var(--color-bg-hover, #252840);
  padding: 1px 6px;
  border-radius: 4px;
}

.pitfall-problem {
  font-size: 12px;
  color: var(--color-text-secondary, #8b8da3);
  margin-top: 8px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>

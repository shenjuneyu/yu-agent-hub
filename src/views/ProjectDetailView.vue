<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useTasksStore } from '../stores/tasks';
import { useSessionsStore } from '../stores/sessions';
import { useGatesStore } from '../stores/gates';
import { useGitStore, type GitStatus } from '../stores/git';
import { useSettingsStore } from '../stores/settings';
import { useIpc } from '../composables/useIpc';
import type { ProjectRecord } from '../stores/projects';
import BaseButton from '../components/common/BaseButton.vue';
import BaseTag from '../components/common/BaseTag.vue';

const route = useRoute();
const router = useRouter();
const projectsStore = useProjectsStore();
const tasksStore = useTasksStore();
const sessionsStore = useSessionsStore();
const gatesStore = useGatesStore();

const gitStore = useGitStore();
const settingsStore = useSettingsStore();
const ipc = useIpc();

const projectId = computed(() => route.params.id as string);
const project = ref<ProjectRecord | null>(null);
const sprintSessionCounts = ref<Record<string, number>>({});
interface SprintGateInfo {
  approved: number;
  total: number;
  gates: Array<{ gateType: string; status: string }>;
}
const sprintGateProgress = ref<Record<string, SprintGateInfo>>({});
// Git overview state
const gitSummary = ref<GitStatus | null>(null);
const gitExpanded = ref(false);
const gitLoading = ref(false);
const gitError = ref(false);
const editingInfo = ref(false);
const editName = ref('');
const editDescription = ref('');

// Claude permission settings
type PermissionMode = '' | 'default' | 'acceptEdits' | 'bypassPermissions' | 'auto';
const permissionMode = ref<PermissionMode>('');
const allowedTools = ref<string[]>([]);
const newToolInput = ref('');

const permissionModeOptions: { value: PermissionMode; label: string; desc: string }[] = [
  { value: '', label: '不指定', desc: '使用 Claude Code 預設行為' },
  { value: 'default', label: '預設', desc: '每次操作都詢問' },
  { value: 'acceptEdits', label: '自動接受編輯', desc: '檔案編輯自動通過，其他詢問' },
  { value: 'auto', label: '自動', desc: '大部分操作自動通過' },
  { value: 'bypassPermissions', label: '跳過所有權限', desc: '不詢問任何權限（僅限安全環境）' },
];

async function loadPermissionSettings() {
  const prefs = settingsStore.preferences;
  const pid = projectId.value;
  const modeKey = `project.${pid}.permission-mode`;
  const toolsKey = `project.${pid}.allowed-tools`;
  if (prefs[modeKey]) permissionMode.value = prefs[modeKey] as PermissionMode;
  if (prefs[toolsKey]) {
    try { allowedTools.value = JSON.parse(prefs[toolsKey]); } catch { /* ignore */ }
  }
}

async function savePermissionMode() {
  await settingsStore.update(
    `project.${projectId.value}.permission-mode`,
    permissionMode.value,
    'permissions',
  );
}

async function addAllowedTool() {
  const tool = newToolInput.value.trim();
  if (!tool || allowedTools.value.includes(tool)) return;
  allowedTools.value.push(tool);
  newToolInput.value = '';
  await saveAllowedTools();
}

async function removeAllowedTool(tool: string) {
  allowedTools.value = allowedTools.value.filter((t) => t !== tool);
  await saveAllowedTools();
}

async function saveAllowedTools() {
  await settingsStore.update(
    `project.${projectId.value}.allowed-tools`,
    JSON.stringify(allowedTools.value),
    'permissions',
  );
}

onMounted(async () => {
  const id = projectId.value;

  // Load project
  const found = projectsStore.projects.find((p) => p.id === id);
  if (found) {
    project.value = found;
  } else {
    await projectsStore.fetchAll();
    project.value = projectsStore.projects.find((p) => p.id === id) || null;
  }

  if (!project.value) return;

  // Load related data in parallel
  await Promise.all([
    projectsStore.fetchSprints(id),
    projectsStore.fetchStats(id),
    loadTasks(id),
    settingsStore.fetchAll().then(() => {
      loadPermissionSettings();
    }),
  ]);

  // Load gate progress per sprint
  await loadSprintGateProgress();

  // Load git overview if workDir exists
  if (project.value?.workDir) {
    await loadGitSummary(project.value.workDir);
  }
});

async function loadGitSummary(workDir: string) {
  gitLoading.value = true;
  gitError.value = false;
  try {
    await gitStore.fetchStatus(workDir);
    await gitStore.fetchLog(workDir, 1);
    gitSummary.value = gitStore.status;
  } catch {
    gitError.value = true;
  } finally {
    gitLoading.value = false;
  }
}

async function toggleGitCard() {
  gitExpanded.value = !gitExpanded.value;
  if (gitExpanded.value && !gitSummary.value && project.value?.workDir) {
    await loadGitSummary(project.value.workDir);
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

async function loadTasks(id: string) {
  tasksStore.setProject(id);
  await tasksStore.fetchTasks(id);
  await tasksStore.fetchSessionCounts();
  await computeSprintSessionCounts(id);
}

async function computeSprintSessionCounts(pid: string) {
  const sessions = await sessionsStore.fetchByProject(pid);
  const counts: Record<string, number> = {};
  for (const s of sessions as any[]) {
    if (s.task_id) {
      const task = tasksStore.tasks.find((t) => t.id === s.task_id);
      if (task?.sprintId) {
        counts[task.sprintId] = (counts[task.sprintId] || 0) + 1;
      }
    }
  }
  sprintSessionCounts.value = counts;
}

async function loadSprintGateProgress() {
  const progress: Record<string, SprintGateInfo> = {};
  for (const sprint of projectsStore.sprints) {
    await gatesStore.fetchGates(projectId.value, sprint.id);
    const gates = gatesStore.gates;
    const approved = gates.filter((g) => g.status === 'approved').length;
    const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
    const sorted = [...gates]
      .sort((a, b) => GATE_ORDER.indexOf(a.gateType) - GATE_ORDER.indexOf(b.gateType))
      .map((g) => ({ gateType: g.gateType, status: g.status }));
    progress[sprint.id] = { approved, total: gates.length || 1, gates: sorted };
  }
  sprintGateProgress.value = progress;
}

function startEditInfo() {
  if (!project.value) return;
  editName.value = project.value.name;
  editDescription.value = project.value.description;
  editingInfo.value = true;
}

async function saveInfo() {
  if (!project.value || !editName.value.trim()) return;
  const updated = await projectsStore.update(project.value.id, {
    name: editName.value.trim(),
    description: editDescription.value.trim(),
  });
  if (updated) {
    project.value = updated;
  }
  editingInfo.value = false;
}

const stats = computed(() => projectsStore.projectStats[projectId.value] ?? null);

const statusLabel: Record<string, string> = {
  planning: '規劃中',
  active: '進行中',
  paused: '暫停',
  completed: '已完成',
  archived: '已封存',
};

const statusColor: Record<string, 'purple' | 'green' | 'yellow' | 'red' | 'blue'> = {
  planning: 'purple',
  active: 'green',
  paused: 'yellow',
  completed: 'blue',
  archived: 'red',
};

const sprintStatusLabel: Record<string, string> = {
  planning: '規劃中',
  active: '進行中',
  review: '審查中',
  completed: '已完成',
};

const sprintStatusColor: Record<string, 'purple' | 'green' | 'yellow' | 'blue'> = {
  planning: 'purple',
  active: 'green',
  review: 'yellow',
  completed: 'blue',
};

type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived';

const availableStatusTransitions = computed((): { status: ProjectStatus; label: string }[] => {
  if (!project.value) return [];
  const map: Record<string, { status: ProjectStatus; label: string }[]> = {
    planning: [{ status: 'active', label: '啟動專案' }],
    active: [
      { status: 'paused', label: '暫停' },
      { status: 'completed', label: '完成' },
    ],
    paused: [
      { status: 'active', label: '恢復' },
      { status: 'archived', label: '封存' },
    ],
    completed: [{ status: 'archived', label: '封存' }],
    archived: [],
  };
  return map[project.value.status] || [];
});

async function changeProjectStatus(newStatus: ProjectStatus) {
  if (!project.value) return;
  const updated = await projectsStore.update(project.value.id, { status: newStatus });
  if (updated) {
    project.value = updated;
  }
}
</script>

<template>
  <!-- Not found -->
  <div v-if="!project" class="detail-not-found">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.3">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span>專案不存在</span>
  </div>

  <!-- Main layout -->
  <div v-else class="detail-shell">

    <!-- Top bar -->
    <div class="detail-topbar">
      <button class="detail-back-btn" @click="router.push('/projects')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        專案
      </button>
      <span class="detail-topbar-sep">/</span>
      <span class="detail-topbar-title">{{ project.name }}</span>
      <BaseTag :color="statusColor[project.status] || 'purple'">
        {{ statusLabel[project.status] || project.status }}
      </BaseTag>
      <div class="detail-topbar-actions">
        <BaseButton v-if="!editingInfo" variant="ghost" size="sm" @click="startEditInfo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          編輯
        </BaseButton>
        <BaseButton
          v-for="t in availableStatusTransitions"
          :key="t.status"
          :variant="t.status === 'active' ? 'primary' : t.status === 'completed' ? 'success' : 'ghost'"
          size="sm"
          @click="changeProjectStatus(t.status)"
        >
          {{ t.label }}
        </BaseButton>
      </div>
    </div>

    <!-- 2-column body -->
    <div class="detail-body">

      <!-- LEFT PANEL -->
      <div class="detail-panel-left">

        <!-- Project info card -->
        <div class="detail-card">
          <div class="detail-card-label">專案資訊</div>

          <!-- Edit mode -->
          <template v-if="editingInfo">
            <div class="detail-form-group" style="margin-bottom:10px;">
              <label class="detail-form-label">名稱</label>
              <input
                v-model="editName"
                class="detail-input"
              />
            </div>
            <div class="detail-form-group" style="margin-bottom:12px;">
              <label class="detail-form-label">描述</label>
              <textarea
                v-model="editDescription"
                class="detail-input"
                rows="3"
                style="resize:vertical;"
              />
            </div>
            <div class="detail-edit-actions">
              <BaseButton variant="primary" size="sm" @click="saveInfo">儲存</BaseButton>
              <BaseButton variant="ghost" size="sm" @click="editingInfo = false">取消</BaseButton>
            </div>
          </template>

          <!-- View mode -->
          <template v-else>
            <div class="detail-info-row">
              <span class="detail-info-key">名稱</span>
              <span class="detail-info-val" style="font-weight:600;">{{ project.name }}</span>
            </div>
            <div class="detail-info-row">
              <span class="detail-info-key">類型</span>
              <span class="detail-info-val">
                <BaseTag color="blue">web-app</BaseTag>
              </span>
            </div>
            <div class="detail-info-row">
              <span class="detail-info-key">狀態</span>
              <span class="detail-info-val">
                <BaseTag :color="statusColor[project.status] || 'purple'">
                  {{ statusLabel[project.status] || project.status }}
                </BaseTag>
              </span>
            </div>
            <div v-if="project.workDir" class="detail-info-row">
              <span class="detail-info-key">工作目錄</span>
              <span class="detail-info-val detail-info-mono">{{ project.workDir }}</span>
            </div>
            <div class="detail-info-row">
              <span class="detail-info-key">建立日期</span>
              <span class="detail-info-val detail-info-muted">{{ project.createdAt?.slice(0, 10) || '--' }}</span>
            </div>
            <div class="detail-info-row" style="border-bottom:none;">
              <span class="detail-info-key">描述</span>
              <span class="detail-info-val" style="font-size:12px;color:var(--color-text-secondary);line-height:1.6;">
                {{ project.description || '尚無描述' }}
              </span>
            </div>
          </template>
        </div>

        <!-- Git Overview -->
        <div v-if="project.workDir" class="detail-card">
          <div class="detail-collapsible-header" @click="toggleGitCard">
            <span class="detail-card-label" style="margin-bottom:0;">Git 狀態</span>
            <span class="detail-chevron" :class="{ open: gitExpanded }">&#9654;</span>
          </div>
          <div v-if="gitExpanded" class="detail-collapsible-body">
            <div v-if="gitLoading" class="detail-empty-small">載入中...</div>
            <div v-else-if="gitError" class="detail-empty-small">無法取得 Git 狀態</div>
            <div v-else-if="gitSummary" class="detail-git-info">
              <div class="detail-git-row">
                <span class="detail-git-key">分支</span>
                <span class="detail-git-branch">{{ gitSummary.branch || 'unknown' }}</span>
                <span class="detail-git-key" style="margin-left:12px;">Ahead</span>
                <span :class="gitSummary.ahead > 0 ? 'detail-git-val--warning' : 'detail-git-val--muted'">{{ gitSummary.ahead }}</span>
                <span class="detail-git-key" style="margin-left:12px;">Behind</span>
                <span :class="gitSummary.behind > 0 ? 'detail-git-val--info' : 'detail-git-val--muted'">{{ gitSummary.behind }}</span>
              </div>
              <div class="detail-git-row">
                <span class="detail-git-key">暫存</span>
                <span :class="gitSummary.staged.length > 0 ? 'detail-git-val--success' : 'detail-git-val--muted'">{{ gitSummary.staged.length }}</span>
                <span class="detail-git-key" style="margin-left:12px;">修改</span>
                <span :class="gitSummary.modified.length > 0 ? 'detail-git-val--warning' : 'detail-git-val--muted'">{{ gitSummary.modified.length }}</span>
                <span class="detail-git-key" style="margin-left:12px;">未追蹤</span>
                <span :class="gitSummary.untracked.length > 0 ? 'detail-git-val--info' : 'detail-git-val--muted'">{{ gitSummary.untracked.length }}</span>
              </div>
              <div v-if="gitStore.commits.length > 0" class="detail-git-row" style="gap:6px;">
                <span class="detail-git-key">最近提交</span>
                <span class="detail-git-commit">{{ gitStore.commits[0].message }}</span>
                <span class="detail-git-key">({{ formatRelativeTime(gitStore.commits[0].date) }})</span>
              </div>
            </div>
            <div v-else class="detail-empty-small">此目錄不是 Git 儲存庫</div>
          </div>
        </div>

        <!-- Claude Permission Settings -->
        <div class="detail-card">
          <div class="detail-card-label">Claude 權限設定</div>
          <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px;">
            此專案的 Session 啟動時自動套用以下權限設定
          </p>
          <div style="margin-bottom:14px;">
            <label class="detail-form-label" style="margin-bottom:8px;">權限模式</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              <button
                v-for="opt in permissionModeOptions"
                :key="opt.value"
                class="detail-perm-btn"
                :class="{ active: permissionMode === opt.value }"
                @click="permissionMode = opt.value; savePermissionMode()"
              >
                <div style="font-size:12px;font-weight:500;">{{ opt.label }}</div>
                <div style="font-size:10px;color:var(--color-text-muted);">{{ opt.desc }}</div>
              </button>
            </div>
          </div>
          <div>
            <label class="detail-form-label" style="margin-bottom:6px;">預設允許工具</label>
            <div v-if="allowedTools.length > 0" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
              <span
                v-for="tool in allowedTools"
                :key="tool"
                class="detail-tool-tag"
              >
                {{ tool }}
                <button class="detail-tool-remove" @click="removeAllowedTool(tool)">&times;</button>
              </span>
            </div>
            <div style="display:flex;gap:8px;">
              <input
                v-model="newToolInput"
                class="detail-input"
                style="flex:1;font-size:12px;"
                placeholder="例如：Bash(git:*), Edit, Read, Write"
                @keydown.enter="addAllowedTool"
              />
              <BaseButton variant="ghost" size="sm" :disabled="!newToolInput.trim()" @click="addAllowedTool">
                新增
              </BaseButton>
            </div>
            <p style="margin-top:6px;font-size:10px;color:var(--color-text-muted);">
              格式同 Claude Code --allowedTools，如 Bash(git:*), Edit, Read
            </p>
          </div>
        </div>

        <!-- Sprint list -->
        <div>
          <div class="detail-section-header">
            <span class="detail-section-title">Sprint 歷程</span>
          </div>

          <!-- Empty -->
          <div v-if="projectsStore.sprints.length === 0" class="detail-sprint-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:0.4;">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span class="detail-empty-title">尚無 Sprint</span>
            <span class="detail-empty-desc">Sprint 由 PM 透過提案流程建立</span>
          </div>

          <!-- Sprint cards -->
          <div v-else class="detail-sprint-list">
            <div
              v-for="sprint in projectsStore.sprints"
              :key="sprint.id"
              class="detail-sprint-item"
              :class="{ 'active-sprint': sprint.status === 'active' }"
            >
              <!-- Sprint header -->
              <div class="detail-sprint-header">
                <span class="detail-sprint-name">{{ sprint.name }}</span>
                <span
                  v-if="sprint.sprintType && sprint.sprintType !== 'full'"
                  class="detail-sprint-type"
                >
                  {{ { feature: '功能', bugfix: '修復', release: '發佈' }[sprint.sprintType] || sprint.sprintType }}
                </span>
                <span
                  v-if="sprintSessionCounts[sprint.id]"
                  class="detail-sprint-session-count"
                >
                  {{ sprintSessionCounts[sprint.id] }} Session
                </span>
                <BaseTag :color="sprintStatusColor[sprint.status]" style="font-size:10px;">
                  {{ sprintStatusLabel[sprint.status] }}
                </BaseTag>
                <BaseButton
                  v-if="sprint.status === 'planning'"
                  variant="ghost"
                  size="sm"
                  @click.stop="projectsStore.doStartSprint(sprint.id)"
                >
                  啟動
                </BaseButton>
              </div>

              <!-- Sprint body (always shown for active, hidden for completed via CSS) -->
              <div
                class="detail-sprint-body"
                :class="{ 'sprint-body-compact': sprint.status === 'completed' }"
              >
                <!-- Goal -->
                <div v-if="sprint.goal" class="detail-sprint-goal">{{ sprint.goal }}</div>

                <!-- Gate pipeline -->
                <div v-if="sprintGateProgress[sprint.id] && sprintGateProgress[sprint.id].gates.length > 0">
                  <div class="detail-gate-label">Gate 進度管線</div>
                  <div class="detail-gate-pipeline">
                    <div
                      v-for="g in sprintGateProgress[sprint.id].gates"
                      :key="g.gateType"
                      class="detail-gate-node"
                      :class="{
                        passed: g.status === 'approved',
                        rejected: g.status === 'rejected',
                        submitted: g.status === 'submitted',
                        current: g.status === 'pending' && sprint.status === 'active'
                      }"
                    >
                      <div class="detail-gate-dot">{{ g.gateType }}</div>
                      <div class="detail-gate-node-label">{{ g.gateType }}</div>
                    </div>
                  </div>
                </div>

                <!-- Progress bar -->
                <div v-if="sprintGateProgress[sprint.id]">
                  <div class="detail-sprint-progress-track">
                    <div
                      class="detail-sprint-progress-fill"
                      :class="sprint.status === 'completed' ? 'success' : ''"
                      :style="{
                        width: `${Math.round((sprintGateProgress[sprint.id].approved / sprintGateProgress[sprint.id].total) * 100)}%`
                      }"
                    />
                  </div>
                  <div class="detail-sprint-meta">
                    <span>{{ sprintGateProgress[sprint.id].approved }} / {{ sprintGateProgress[sprint.id].total }} 關卡通過</span>
                    <span :style="sprint.status === 'completed' ? 'color:var(--color-success)' : ''">
                      {{ Math.round((sprintGateProgress[sprint.id].approved / sprintGateProgress[sprint.id].total) * 100) }}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- RIGHT PANEL -->
      <div class="detail-panel-right">

        <!-- Stats grid -->
        <div>
          <div class="detail-section-title" style="margin-bottom:10px;">統計</div>
          <div v-if="stats" class="detail-stat-grid">
            <div class="detail-stat-mini">
              <span class="detail-stat-val">{{ tasksStore.totalCount }}</span>
              <span class="detail-stat-label">總任務</span>
            </div>
            <div class="detail-stat-mini">
              <span class="detail-stat-val" style="color:var(--color-success);">{{ stats.tasksDone ?? 0 }}</span>
              <span class="detail-stat-label">已完成</span>
            </div>
            <div class="detail-stat-mini">
              <span class="detail-stat-val" style="color:var(--color-warning);">{{ stats.tasksInProgress ?? 0 }}</span>
              <span class="detail-stat-label">進行中</span>
            </div>
            <div class="detail-stat-mini">
              <span class="detail-stat-val">{{ tasksStore.totalCount - (stats.tasksDone ?? 0) - (stats.tasksInProgress ?? 0) }}</span>
              <span class="detail-stat-label">待開始</span>
            </div>
          </div>
          <div v-else class="detail-stat-grid">
            <div class="detail-stat-mini"><span class="detail-stat-val">--</span><span class="detail-stat-label">總任務</span></div>
            <div class="detail-stat-mini"><span class="detail-stat-val">--</span><span class="detail-stat-label">已完成</span></div>
            <div class="detail-stat-mini"><span class="detail-stat-val">--</span><span class="detail-stat-label">進行中</span></div>
            <div class="detail-stat-mini"><span class="detail-stat-val">--</span><span class="detail-stat-label">待開始</span></div>
          </div>

          <div v-if="stats?.activeSprint" class="detail-stat-full">
            <span class="detail-stat-full-label">Sprint 進度</span>
            <span class="detail-stat-full-val">{{ stats.activeSprint.progressPct }}%</span>
          </div>
        </div>

        <!-- Recent tasks -->
        <div>
          <div class="detail-section-title" style="margin-bottom:10px;">最近任務</div>
          <div v-if="tasksStore.totalCount === 0" class="detail-right-empty">
            <span>尚無任務，可到任務看板建立</span>
          </div>
          <div v-else class="detail-list-card">
            <div
              v-for="task in tasksStore.tasks.slice(0, 6)"
              :key="task.id"
              class="detail-list-item"
            >
              <div
                class="detail-list-dot"
                :style="{
                  background: task.status === 'done' ? 'var(--color-success)'
                    : task.status === 'in_progress' ? 'var(--color-warning)'
                    : task.status === 'blocked' ? 'var(--color-danger)'
                    : 'var(--color-text-muted)'
                }"
              />
              <span class="detail-list-name">{{ task.title }}</span>
              <span
                class="detail-list-meta"
                :style="{
                  color: task.status === 'done' ? 'var(--color-success)'
                    : task.status === 'in_progress' ? 'var(--color-warning)'
                    : task.status === 'blocked' ? 'var(--color-danger)'
                    : 'var(--color-text-muted)'
                }"
              >
                {{ { created: '待處理', assigned: '已分配', in_progress: '進行中', in_review: '審查中', blocked: '阻塞', done: '完成' }[task.status] || task.status }}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────── */
.detail-not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 14px;
}

.detail-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Top bar ─────────────────────────────────────── */
.detail-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  border-bottom: 1px solid var(--color-border-default);
  padding: 0 20px;
  flex-shrink: 0;
}

.detail-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  border: none;
  background: none;
  font-family: inherit;
  transition: all 0.15s;
}
.detail-back-btn:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
}

.detail-topbar-sep {
  color: var(--color-text-muted);
  font-size: 14px;
}

.detail-topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
}

.detail-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Body: 2-column ─────────────────────────────── */
.detail-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* LEFT panel */
.detail-panel-left {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-right: 1px solid var(--color-border-default);
}

/* RIGHT panel */
.detail-panel-right {
  width: 320px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Cards ───────────────────────────────────────── */
.detail-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  padding: 16px;
}

.detail-card-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 14px;
}

.detail-card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

/* ── Info rows ───────────────────────────────────── */
.detail-info-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 7px 0;
  border-bottom: 1px solid var(--color-border-default);
}

.detail-info-key {
  font-size: 12px;
  color: var(--color-text-muted);
  width: 80px;
  flex-shrink: 0;
  padding-top: 1px;
}

.detail-info-val {
  font-size: 13px;
  color: var(--color-text-primary);
  flex: 1;
  word-break: break-all;
}

.detail-info-mono {
  font-family: 'Consolas', 'SF Mono', monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.detail-info-muted {
  color: var(--color-text-muted);
  font-size: 12px;
}

/* ── Edit form ───────────────────────────────────── */
.detail-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-form-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.detail-input {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-primary);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}
.detail-input:focus { border-color: var(--color-accent); }

.detail-edit-actions {
  display: flex;
  gap: 8px;
}

/* ── Budget progress ─────────────────────────────── */
.detail-budget-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 5px;
  color: var(--color-text-secondary);
}

.detail-progress-track {
  height: 6px;
  background: var(--color-bg-hover);
  border-radius: 99px;
  overflow: hidden;
}

.detail-progress-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease;
}
.detail-progress-fill.bg-accent {
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-light));
}
.detail-progress-fill.bg-warning { background: var(--color-warning); }
.detail-progress-fill.bg-danger { background: var(--color-danger); }

/* ── Collapsible ─────────────────────────────────── */
.detail-collapsible-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.detail-chevron {
  font-size: 11px;
  color: var(--color-text-muted);
  transition: transform 0.2s;
}
.detail-chevron.open { transform: rotate(90deg); }

.detail-collapsible-body { margin-top: 12px; }

/* ── Git info ────────────────────────────────────── */
.detail-git-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.detail-git-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.detail-git-key { color: var(--color-text-muted); }

.detail-git-val--muted { color: var(--color-text-secondary); }
.detail-git-val--warning { color: var(--color-warning); }
.detail-git-val--info { color: var(--color-info); }
.detail-git-val--success { color: var(--color-success); }

.detail-git-branch {
  font-family: 'Consolas', monospace;
  font-size: 11px;
  background: var(--color-bg-hover);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--color-text-primary);
}

.detail-git-commit {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

/* ── Claude Code integration ─────────────────────── */
.detail-skill-sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 7px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-primary);
  color: var(--color-text-muted);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.detail-skill-sync-btn.active {
  border-color: var(--color-accent);
  background: rgba(108, 92, 231, 0.1);
  color: var(--color-accent-light);
}

.detail-sync-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(92, 94, 114, 0.3);
  flex-shrink: 0;
}
.detail-sync-dot.active { background: var(--color-accent); }

.detail-count-badge {
  font-size: 10px;
  background: var(--color-bg-hover);
  border-radius: 99px;
  padding: 1px 6px;
  color: var(--color-text-muted);
}

.detail-file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 4px;
}

/* ── Permission settings ─────────────────────────── */
.detail-perm-btn {
  cursor: pointer;
  border-radius: 8px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  padding: 8px 12px;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
}
.detail-perm-btn.active {
  border-color: var(--color-accent);
  background: rgba(108, 92, 231, 0.1);
  color: var(--color-text-primary);
}

.detail-tool-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 5px;
  background: rgba(108, 92, 231, 0.1);
  color: var(--color-accent-light);
  padding: 2px 8px;
  font-size: 11px;
}

.detail-tool-remove {
  background: none;
  border: none;
  color: rgba(162, 155, 254, 0.6);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  line-height: 1;
}
.detail-tool-remove:hover { color: var(--color-accent-light); }

/* ── Error box ───────────────────────────────────── */
.detail-error-box {
  border-radius: 6px;
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-danger);
  padding: 6px 10px;
  font-size: 11px;
  margin-bottom: 8px;
}

/* ── Section titles ──────────────────────────────── */
.detail-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Sprint section ──────────────────────────────── */
.detail-sprint-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  gap: 8px;
  color: var(--color-text-muted);
}

.detail-empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.detail-empty-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  max-width: 260px;
  line-height: 1.6;
}

.detail-empty-small {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.detail-sprint-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-sprint-item {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.detail-sprint-item.active-sprint { border-color: var(--color-accent); }

.detail-sprint-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  user-select: none;
  flex-wrap: wrap;
}

.detail-sprint-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  min-width: 80px;
}

.detail-sprint-type {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-accent-light);
  background: rgba(108, 92, 231, 0.1);
  border-radius: 4px;
  padding: 1px 6px;
}

.detail-sprint-session-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-accent-light);
  background: rgba(108, 92, 231, 0.15);
  border-radius: 99px;
  padding: 1px 8px;
}

.detail-sprint-body {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sprint-body-compact {
  padding: 0 16px 10px;
  gap: 8px;
}

.detail-sprint-goal {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  padding: 8px 12px;
  background: var(--color-bg-primary);
  border-radius: 6px;
  border: 1px solid var(--color-border-default);
}

/* ── Gate pipeline ───────────────────────────────── */
.detail-gate-label {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.detail-gate-pipeline {
  display: flex;
  align-items: center;
}

.detail-gate-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  position: relative;
}

.detail-gate-node:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 10px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: var(--color-border-default);
  z-index: 0;
}

.detail-gate-node.passed:not(:last-child)::after { background: var(--color-success); }

.detail-gate-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  position: relative;
  z-index: 1;
  background: var(--color-border-default);
  color: var(--color-text-muted);
  transition: all 0.2s;
}

.detail-gate-node.passed .detail-gate-dot {
  background: var(--color-success);
  color: #fff;
  box-shadow: 0 0 8px rgba(0, 214, 143, 0.4);
}

.detail-gate-node.current .detail-gate-dot {
  background: var(--color-accent);
  color: #fff;
  box-shadow: 0 0 8px rgba(108, 92, 231, 0.5);
  animation: gate-pulse 2s infinite;
}

@keyframes gate-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(108, 92, 231, 0.4); }
  50% { box-shadow: 0 0 16px rgba(108, 92, 231, 0.7); }
}

.detail-gate-node-label {
  font-size: 9px;
  color: var(--color-text-muted);
  font-weight: 500;
}
.detail-gate-node.passed .detail-gate-node-label { color: var(--color-success); }
.detail-gate-node.current .detail-gate-node-label { color: var(--color-accent-light); }
.detail-gate-node.rejected .detail-gate-dot {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: #fff;
}
.detail-gate-node.rejected .detail-gate-node-label { color: var(--color-danger); }
.detail-gate-node.rejected:not(:last-child)::after { background: var(--color-danger); }
.detail-gate-node.submitted .detail-gate-dot {
  border-color: var(--color-info);
  background: transparent;
  color: var(--color-info);
}
.detail-gate-node.submitted .detail-gate-node-label { color: var(--color-info); }

/* ── Sprint progress bar ─────────────────────────── */
.detail-sprint-progress-track {
  height: 5px;
  background: var(--color-border-default);
  border-radius: 99px;
  overflow: hidden;
}

.detail-sprint-progress-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-light));
  transition: width 0.3s ease;
}
.detail-sprint-progress-fill.success {
  background: linear-gradient(90deg, var(--color-success), #00e6a0);
}

.detail-sprint-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
}

/* ── Right panel stats ───────────────────────────── */
.detail-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.detail-stat-mini {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-stat-val {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.detail-stat-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.detail-stat-full {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 8px;
}

.detail-stat-full-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.detail-stat-full-val {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.detail-stat-full-val.token-val {
  font-size: 13px;
  color: var(--color-accent-light);
  font-family: 'Consolas', monospace;
}

/* ── List card (tasks) ───────────────────────────── */
.detail-list-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  padding: 4px 12px;
}

.detail-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--color-border-default);
  cursor: pointer;
  transition: all 0.15s;
}
.detail-list-item:last-child { border-bottom: none; }

.detail-list-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.detail-list-name {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-list-meta {
  font-size: 10px;
  white-space: nowrap;
  color: var(--color-text-muted);
}

/* ── Right empty ─────────────────────────────────── */
.detail-right-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ── Modal ───────────────────────────────────────── */
.detail-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.detail-modal {
  width: 420px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  max-height: 90vh;
  overflow-y: auto;
}

.detail-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.detail-sprint-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.detail-type-btn {
  cursor: pointer;
  border-radius: 8px;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  padding: 8px 12px;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
}
.detail-type-btn.active {
  border-color: var(--color-accent);
  background: rgba(108, 92, 231, 0.1);
  color: var(--color-text-primary);
}

.detail-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ── Utility colors ──────────────────────────────── */
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }
.text-info { color: var(--color-info); }
.text-text-secondary { color: var(--color-text-secondary); }
</style>

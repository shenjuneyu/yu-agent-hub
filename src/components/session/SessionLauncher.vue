<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import SessionAgentSelector from './SessionAgentSelector.vue';
import SessionTaskSelector from './SessionTaskSelector.vue';
import SessionConfigPanel from './SessionConfigPanel.vue';
import { useAgentsStore } from '../../stores/agents';
import { useSessionsStore } from '../../stores/sessions';
import { useTasksStore, type TaskRecord } from '../../stores/tasks';
import { useProjectsStore } from '../../stores/projects';
import { useIpc } from '../../composables/useIpc';

export interface RemixData {
  agentId: string;
  task: string;
  model: 'opus' | 'sonnet' | 'haiku';
  projectId?: string | null;
  taskId?: string | null;
}

const props = defineProps<{
  show: boolean;
  preselectedAgentId?: string;
  preselectedTaskId?: string;
  preselectedProjectId?: string;
  remixData?: RemixData | null;
  parentSessionId?: string;
}>();

const emit = defineEmits<{
  close: [];
  launched: [sessionId: string];
}>();

const { t } = useI18n();
const agentsStore = useAgentsStore();
const sessionsStore = useSessionsStore();
const tasksStore = useTasksStore();
const projectsStore = useProjectsStore();
const ipc = useIpc();

const selectedAgentId = ref('');
const task = ref('');
const model = ref<'opus' | 'sonnet' | 'haiku'>('sonnet');
const maxTurns = ref(10);
const selectedTaskId = ref<string | null>(null);
const showPromptPreview = ref(false);
const promptPreview = ref('');
const launching = ref(false);
const availableTasks = ref<TaskRecord[]>([]);

// Batch mode
const batchMode = ref(false);
const batchAgentIds = ref<Set<string>>(new Set());

const selectedProjectId = ref<string | null>(null);

// 9E: 內嵌專案建立
const showCreateProject = ref(false);
const newProjectName = ref('');
const newProjectWorkDir = ref('');
const newProjectTemplate = ref('web-app');
const creatingProject = ref(false);

const templateOptions = computed(() => [
  { value: 'web-app', label: t('projects.modal.templateWebApp') },
  { value: 'api-service', label: t('projects.modal.templateApiService') },
  { value: 'mobile-app', label: t('projects.modal.templateMobileApp') },
  { value: 'library', label: t('projects.modal.templateLibrary') },
]);

const effectiveProjectId = computed(() =>
  props.preselectedProjectId || selectedProjectId.value || projectsStore.selectedProjectId || null,
);

/** Non-done tasks, flat list (used when a project is selected) */
const filteredTasks = computed(() =>
  availableTasks.value.filter((t) => t.status !== 'done'),
);

/** Non-done tasks grouped by project (used when no project is selected) */
const tasksByProject = computed(() => {
  const groups = new Map<string, TaskRecord[]>();
  for (const t of filteredTasks.value) {
    const pid = t.projectId || '__none__';
    if (!groups.has(pid)) groups.set(pid, []);
    groups.get(pid)!.push(t);
  }
  return groups;
});

const selectedAgent = computed(() =>
  selectedAgentId.value ? agentsStore.getById(selectedAgentId.value) : null,
);

const canLaunch = computed(() => !!selectedAgentId.value);

/** Agent is locked when pre-selected from agent page or remix */
const agentLocked = computed(() => !!(props.preselectedAgentId || props.remixData));

const modelOptions = computed(() => [
  { value: 'opus', label: 'Opus', desc: t('sessions.launcher.modelOpus') },
  { value: 'sonnet', label: 'Sonnet', desc: t('sessions.launcher.modelSonnet') },
  { value: 'haiku', label: 'Haiku', desc: t('sessions.launcher.modelHaiku') },
]);

const departmentLabel = computed<Record<string, string>>(() => ({
  engineering: t('agents.departments.engineering'),
  design: t('agents.departments.design'),
  product: t('agents.departments.product'),
  marketing: t('agents.departments.marketing'),
  testing: t('agents.departments.testing'),
  'project-management': t('agents.departments.project-management'),
  'studio-operations': t('agents.departments.studio-operations'),
  company: t('agents.departments.company'),
  bonus: t('agents.departments.bonus'),
}));

watch(
  () => props.show,
  async (isShow) => {
    if (isShow) {
      // Remix prefill takes priority
      if (props.remixData) {
        selectedAgentId.value = props.remixData.agentId;
        task.value = props.remixData.task;
        model.value = props.remixData.model;
        selectedTaskId.value = props.remixData.taskId || null;
      } else if (props.preselectedAgentId) {
        selectedAgentId.value = props.preselectedAgentId;
        const agent = agentsStore.getById(props.preselectedAgentId);
        if (agent) model.value = agent.model;
        task.value = '';
        selectedTaskId.value = null;
      } else {
        selectedAgentId.value = '';
        task.value = '';
        selectedTaskId.value = null;
        selectedProjectId.value = null;
      }

      // Prefill from task
      if (props.preselectedTaskId) {
        selectedTaskId.value = props.preselectedTaskId;
        const t = tasksStore.tasks.find((t) => t.id === props.preselectedTaskId);
        if (t) {
          task.value = task.value || t.description || t.title;
        }
      }

      // Load available tasks — scoped to project if selected, otherwise all projects
      try {
        const pid = effectiveProjectId.value;
        const filters = pid ? { projectId: pid } : {};
        availableTasks.value = (await ipc.listTasks(filters)) as TaskRecord[];
      } catch { availableTasks.value = []; }

      showPromptPreview.value = false;
      promptPreview.value = '';
    }
  },
);

// Reload tasks when project selection changes
watch(selectedProjectId, async () => {
  if (!props.show) return;
  try {
    const pid = effectiveProjectId.value;
    const filters = pid ? { projectId: pid } : {};
    availableTasks.value = (await ipc.listTasks(filters)) as TaskRecord[];
  } catch { availableTasks.value = []; }
  selectedTaskId.value = null;
});

async function loadPromptPreview() {
  if (!selectedAgentId.value) return;
  try {
    promptPreview.value = await ipc.previewPrompt(selectedAgentId.value);
    showPromptPreview.value = true;
  } catch (err) {
    promptPreview.value = t('sessions.launcher.promptPreviewError');
    showPromptPreview.value = true;
  }
}

function onTaskSelect(taskId: string) {
  selectedTaskId.value = taskId === 'null' ? null : taskId;
  if (!selectedTaskId.value) return;
  const found = availableTasks.value.find((t) => t.id === selectedTaskId.value);
  if (found) {
    if (!task.value.trim()) {
      task.value = found.description || found.title;
    }
    if (!props.preselectedProjectId && found.projectId) {
      selectedProjectId.value = found.projectId;
    }
    if (!agentLocked.value && found.assignedTo) {
      const agent = agentsStore.getById(found.assignedTo);
      if (agent) {
        selectedAgentId.value = found.assignedTo;
        model.value = agent.model;
      }
    }
  }
}

function toggleBatchAgent(agentId: string) {
  if (batchAgentIds.value.has(agentId)) {
    batchAgentIds.value.delete(agentId);
  } else {
    batchAgentIds.value.add(agentId);
  }
}

const canBatchLaunch = computed(() => batchMode.value && batchAgentIds.value.size > 0);

async function launch() {
  if (batchMode.value) {
    await launchBatch();
    return;
  }
  if (!canLaunch.value) return;
  launching.value = true;
  try {
    const result = await sessionsStore.spawn({
      agentId: selectedAgentId.value,
      task: task.value.trim(),
      model: model.value,
      maxTurns: maxTurns.value,
      projectId: effectiveProjectId.value,
      taskId: selectedTaskId.value || null,
      interactive: true,
      ...(props.parentSessionId ? { parentSessionId: props.parentSessionId } : {}),
    });
    emit('launched', result.sessionId);
    emit('close');
  } catch (err) {
    console.error('Failed to launch session', err);
  } finally {
    launching.value = false;
  }
}

async function launchBatch() {
  launching.value = true;
  let lastSessionId = '';
  try {
    for (const agentId of batchAgentIds.value) {
      const agent = agentsStore.getById(agentId);
      const result = await sessionsStore.spawn({
        agentId,
        task: task.value.trim(),
        model: (agent?.model as 'opus' | 'sonnet' | 'haiku') || model.value,
        maxTurns: maxTurns.value,
        projectId: effectiveProjectId.value,
        taskId: null,
        interactive: true,
      });
      lastSessionId = result.sessionId;
    }
    if (lastSessionId) emit('launched', lastSessionId);
    emit('close');
  } catch (err) {
    console.error('Failed to batch launch sessions', err);
  } finally {
    launching.value = false;
    batchAgentIds.value.clear();
  }
}

function onProjectChange(value: string) {
  if (value === '__create__') {
    showCreateProject.value = true;
    selectedProjectId.value = null;
    newProjectName.value = '';
    newProjectWorkDir.value = '';
    newProjectTemplate.value = 'web-app';
  } else {
    showCreateProject.value = false;
    selectedProjectId.value = value === 'null' ? null : value;
  }
}

async function selectWorkDir() {
  const dir = await ipc.selectFolder();
  if (dir) newProjectWorkDir.value = dir;
}

async function createProject() {
  if (!newProjectName.value.trim() || !newProjectWorkDir.value.trim()) return;
  creatingProject.value = true;
  try {
    const project = (await ipc.createProject({
      name: newProjectName.value.trim(),
      workDir: newProjectWorkDir.value.trim(),
      template: newProjectTemplate.value,
    })) as { id: string };
    // 自動建立 Sprint 1
    try {
      await ipc.createSprint({
        projectId: project.id,
        name: 'Sprint 1',
        sprintType: 'full',
      });
    } catch { /* Sprint 建立失敗不阻塞 */ }
    // 刷新專案列表並選中新專案
    await projectsStore.fetchProjects();
    selectedProjectId.value = project.id;
    showCreateProject.value = false;
  } catch (err) {
    console.error('Failed to create project', err);
  } finally {
    creatingProject.value = false;
  }
}

function onAgentChange(value: string) {
  selectedAgentId.value = value;
  const agent = agentsStore.getById(value);
  if (agent) {
    model.value = agent.model;
  }
  showPromptPreview.value = false;
}
</script>

<template>
  <BaseModal :show="show" :title="$t('sessions.launcher.title')" @close="emit('close')">
    <div class="launcher">
      <!-- Batch mode toggle -->
      <div v-if="!agentLocked" class="batch-toggle">
        <label class="batch-toggle-label">
          <input v-model="batchMode" type="checkbox" class="batch-toggle-input" />
          <span>{{ $t('sessions.launcher.batchMode') }}</span>
        </label>
      </div>

      <!-- Batch Agent Selection (multi-select) -->
      <div v-if="batchMode && !agentLocked" class="batch-agents">
        <label class="launcher__label">{{ $t('sessions.launcher.selectAgents') }}</label>
        <div class="batch-agent-list">
          <template v-for="[dept, agents] in agentsStore.agentsByDepartment" :key="dept">
            <div class="batch-dept-header">{{ departmentLabel[dept] || dept }}</div>
            <label
              v-for="agent in agents"
              :key="agent.id"
              class="batch-agent-item"
              :class="{ 'batch-agent-selected': batchAgentIds.has(agent.id) }"
            >
              <input
                type="checkbox"
                :checked="batchAgentIds.has(agent.id)"
                class="batch-agent-checkbox"
                @change="toggleBatchAgent(agent.id)"
              />
              <span class="batch-agent-name">{{ agentsStore.displayName(agent) }}</span>
              <span class="batch-agent-meta">{{ agent.level }} / {{ agent.model }}</span>
            </label>
          </template>
        </div>
        <div class="batch-count">
          {{ $t('sessions.launcher.batchCount', { n: batchAgentIds.size }) }}
        </div>
      </div>

      <!-- Single Agent Selection (original) -->
      <SessionAgentSelector
        v-if="!batchMode"
        :selected-agent-id="selectedAgentId"
        :agent-locked="agentLocked"
        :selected-agent="selectedAgent"
        :department-label="departmentLabel"
        @update:selected-agent-id="onAgentChange"
      />

      <!-- Project + Task Selection -->
      <SessionTaskSelector
        :preselected-project-id="props.preselectedProjectId"
        :selected-project-id="selectedProjectId"
        :show-create-project="showCreateProject"
        :new-project-name="newProjectName"
        :new-project-work-dir="newProjectWorkDir"
        :new-project-template="newProjectTemplate"
        :creating-project="creatingProject"
        :template-options="templateOptions"
        :projects="projectsStore.projects"
        :selected-task-id="selectedTaskId"
        :filtered-tasks="filteredTasks"
        :tasks-by-project="tasksByProject"
        :effective-project-id="effectiveProjectId"
        @project-change="onProjectChange"
        @task-change="onTaskSelect"
        @update:new-project-name="newProjectName = $event"
        @update:new-project-work-dir="newProjectWorkDir = $event"
        @update:new-project-template="newProjectTemplate = $event"
        @select-work-dir="selectWorkDir"
        @create-project="createProject"
        @cancel-create="showCreateProject = false"
      />

      <!-- Config: task desc + model + max turns + prompt preview -->
      <SessionConfigPanel
        :task="task"
        :model="model"
        :max-turns="maxTurns"
        :show-prompt-preview="showPromptPreview"
        :prompt-preview="promptPreview"
        :model-options="modelOptions"
        @update:task="task = $event"
        @update:model="model = $event"
        @update:max-turns="maxTurns = $event"
        @toggle-preview="loadPromptPreview"
      />
    </div>

    <template #footer>
      <div class="launcher__footer">
        <BaseButton variant="ghost" @click="emit('close')">{{ $t('common.cancel') }}</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="batchMode ? !canBatchLaunch || launching : !canLaunch || launching"
          @click="launch"
        >
          {{ launching
            ? $t('sessions.launcher.launching')
            : batchMode
              ? $t('sessions.launcher.launchBatch', { n: batchAgentIds.size })
              : $t('sessions.launcher.launch')
          }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
/* ── Launcher form shell ── */
.launcher {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Batch mode ── */
.batch-toggle {
  display: flex;
  align-items: center;
}

.batch-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.batch-toggle-input {
  accent-color: var(--color-accent);
}

.batch-agents {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.batch-agent-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: 4px;
}

.batch-dept-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 8px 2px;
}

.batch-agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms;
}

.batch-agent-item:hover {
  background: var(--color-bg-hover);
}

.batch-agent-selected {
  background: rgba(108, 92, 231, 0.1);
}

.batch-agent-checkbox {
  accent-color: var(--color-accent);
}

.batch-agent-name {
  font-size: 13px;
  color: var(--color-text-primary);
  flex: 1;
}

.batch-agent-meta {
  font-size: 10px;
  color: var(--color-text-muted);
}

.batch-count {
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: right;
  margin-top: 2px;
}

/* ── Footer ── */
.launcher__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>

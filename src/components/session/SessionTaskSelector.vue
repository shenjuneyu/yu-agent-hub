<template>
  <div>
    <!-- Project Selection -->
    <div v-if="!preselectedProjectId" class="launcher__field">
      <label class="launcher__label">{{ $t('sessions.launcher.project') }}</label>
      <select
        :value="selectedProjectId"
        class="launcher__select"
        @change="$emit('projectChange', ($event.target as HTMLSelectElement).value)"
      >
        <option :value="null">{{ $t('sessions.launcher.allProjects') }}</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
        <option value="__create__">+ {{ $t('projects.newProject') }}</option>
      </select>

      <!-- Inline create project form -->
      <div v-if="showCreateProject" class="launcher__create-project">
        <div class="launcher__field">
          <label class="launcher__label launcher__label--sm">{{ $t('projects.modal.nameLabel') }}</label>
          <input
            :value="newProjectName"
            type="text"
            :placeholder="$t('projects.modal.namePlaceholder')"
            class="launcher__input launcher__input--sm"
            @input="$emit('update:newProjectName', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="launcher__field">
          <label class="launcher__label launcher__label--sm">{{ $t('projects.modal.workDirLabel') }}</label>
          <div class="launcher__workdir-row">
            <input
              :value="newProjectWorkDir"
              type="text"
              readonly
              :placeholder="$t('sessions.launcher.selectFolder')"
              class="launcher__input launcher__input--sm launcher__input--flex"
            />
            <BaseButton size="sm" @click="$emit('selectWorkDir')">{{ $t('common.browse') }}</BaseButton>
          </div>
        </div>
        <div class="launcher__field">
          <label class="launcher__label launcher__label--sm">{{ $t('projects.modal.selectTemplate') }}</label>
          <select
            :value="newProjectTemplate"
            class="launcher__select launcher__select--sm"
            @change="$emit('update:newProjectTemplate', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="t in templateOptions" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
        </div>
        <div class="launcher__create-project-actions">
          <BaseButton
            size="sm"
            variant="primary"
            :disabled="!newProjectName.trim() || !newProjectWorkDir.trim() || creatingProject"
            @click="$emit('createProject')"
          >
            {{ creatingProject ? $t('sessions.launcher.creating') : $t('projects.modal.create') }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" @click="$emit('cancelCreate')">
            {{ $t('common.cancel') }}
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Associated Task (optional) -->
    <div class="launcher__field">
      <label class="launcher__label">{{ $t('sessions.launcher.associatedTask') }}</label>
      <select
        :value="selectedTaskId"
        class="launcher__select"
        @change="$emit('taskChange', ($event.target as HTMLSelectElement).value)"
      >
        <option :value="null">{{ $t('sessions.launcher.noTask') }}</option>
        <!-- Project selected: flat list -->
        <template v-if="effectiveProjectId">
          <option v-for="t in filteredTasks" :key="t.id" :value="t.id">
            {{ t.title }} ({{ t.status }})
          </option>
        </template>
        <!-- No project: grouped by project -->
        <template v-else>
          <optgroup
            v-for="[pid, tasks] in tasksByProject"
            :key="pid"
            :label="getProjectName(pid)"
          >
            <option v-for="t in tasks" :key="t.id" :value="t.id">
              {{ t.title }} ({{ t.status }})
            </option>
          </optgroup>
        </template>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseButton from '../common/BaseButton.vue';
import type { TaskRecord } from '../../stores/tasks';

const props = defineProps<{
  preselectedProjectId?: string;
  selectedProjectId: string | null;
  showCreateProject: boolean;
  newProjectName: string;
  newProjectWorkDir: string;
  newProjectTemplate: string;
  creatingProject: boolean;
  templateOptions: { value: string; label: string }[];
  projects: { id: string; name: string }[];
  selectedTaskId: string | null;
  filteredTasks: TaskRecord[];
  tasksByProject: Map<string, TaskRecord[]>;
  effectiveProjectId: string | null;
}>();

defineEmits<{
  projectChange: [value: string];
  taskChange: [value: string];
  'update:newProjectName': [value: string];
  'update:newProjectWorkDir': [value: string];
  'update:newProjectTemplate': [value: string];
  selectWorkDir: [];
  createProject: [];
  cancelCreate: [];
}>();

function getProjectName(projectId: string): string {
  if (projectId === '__none__') return '(Unassigned)';
  const p = props.projects.find((proj) => proj.id === projectId);
  return p?.name || projectId.slice(0, 8);
}
</script>

<style scoped>
.launcher__field {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.launcher__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.launcher__label--sm {
  font-size: 11px;
}

.launcher__input {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-hover);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 150ms ease;
}

.launcher__input--sm {
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 12px;
}

.launcher__input--flex {
  flex: 1;
  min-width: 0;
}

.launcher__input::placeholder {
  color: var(--color-text-muted);
}

.launcher__input:focus {
  border-color: var(--color-accent);
}

.launcher__select {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-hover);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 150ms ease;
}

.launcher__select--sm {
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 12px;
}

.launcher__select:focus {
  border-color: var(--color-accent);
}

.launcher__create-project {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(108, 92, 231, 0.3);
  background-color: rgba(108, 92, 231, 0.05);
  padding: 12px;
}

.launcher__workdir-row {
  display: flex;
  gap: 6px;
}

.launcher__create-project-actions {
  display: flex;
  gap: 6px;
}
</style>

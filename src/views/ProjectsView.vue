<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useProjectsStore } from '../stores/projects';
import ProjectCard from '../components/project/ProjectCard.vue';
import ProjectCreateModal from '../components/project/ProjectCreateModal.vue';
import BaseButton from '../components/common/BaseButton.vue';

const projectsStore = useProjectsStore();
const showCreateModal = ref(false);

onMounted(async () => {
  await projectsStore.fetchAll();
  await projectsStore.fetchAllStats();
});

async function handleCreate(params: { name: string; description: string; template: string; workDir: string }) {
  const project = await projectsStore.create(params);
  showCreateModal.value = false;
  await projectsStore.fetchStats(project.id);
}
</script>

<template>
  <div class="projects-view">
    <!-- Header -->
    <div class="projects-header">
      <h2 class="projects-title">專案</h2>
      <BaseButton variant="primary" size="sm" @click="showCreateModal = true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        新增專案
      </BaseButton>
    </div>

    <!-- Project grid -->
    <div class="projects-grid">
      <ProjectCard
        v-for="project in projectsStore.projects"
        :key="project.id"
        :project="project"
        :stats="projectsStore.projectStats[project.id] ?? null"
      />

      <!-- Add new card -->
      <div class="project-card-new" @click="showCreateModal = true">
        <svg class="new-card-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <div class="new-card-text">建立新專案</div>
        <div class="new-card-hint">選擇模板開始</div>
      </div>
    </div>

    <!-- Create Project Modal -->
    <Teleport to="body">
      <ProjectCreateModal
        v-if="showCreateModal"
        @close="showCreateModal = false"
        @create="handleCreate"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.projects-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 20px;
}

.projects-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.projects-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  align-content: start;
  overflow-y: auto;
  flex: 1;
}

/* Add new project card */
.project-card-new {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  border: 2px dashed var(--color-border-default);
  background: transparent;
  cursor: pointer;
  opacity: 0.55;
  transition: all 0.2s;
  text-align: center;
  padding: 20px;
}

.project-card-new:hover {
  opacity: 0.85;
  border-color: var(--color-border-light);
  background: var(--color-bg-card);
  transform: translateY(-1px);
}

.new-card-icon {
  color: var(--color-text-muted);
  transition: color 0.2s;
}

.project-card-new:hover .new-card-icon {
  color: var(--color-accent-light);
}

.new-card-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.new-card-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>

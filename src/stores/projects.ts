import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useIpc } from '../composables/useIpc';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  workDir: string | null;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type SprintType = 'full' | 'feature' | 'bugfix' | 'release';

export interface SprintRecord {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  sprintType: SprintType;
  status: 'planning' | 'active' | 'review' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ProjectStats {
  tasksDone: number;
  tasksInProgress: number;
  totalTasks: number;
  totalTokens: number;
  totalCostUsd: number;
  activeSprint: { name: string; progressPct: number; activeCount: number } | null;
  latestGate: { type: string; status: string } | null;
}

export interface BudgetStatus {
  dailyTokensUsed: number;
  dailyTokenLimit: number;
  dailyPct: number;
  totalTokensUsed: number;
  totalTokenLimit: number;
  totalPct: number;
  alertLevel: 'normal' | 'warning' | 'critical' | 'exceeded';
}

export const useProjectsStore = defineStore('projects', () => {
  const {
    listProjects,
    createProject,
    updateProject,
    deleteProject,
    getProjectBudget,
    getProjectStats,
    listSprints,
    createSprint,
    startSprint,
    enterSprintReview,
    completeSprint,
    getSprintStatus,
  } = useIpc();

  const projects = ref<ProjectRecord[]>([]);
  const selectedProjectId = ref<string | null>(null);
  const sprints = ref<SprintRecord[]>([]);
  const budget = ref<BudgetStatus | null>(null);
  const projectStats = ref<Record<string, ProjectStats>>({});
  const loading = ref(false);

  const selectedProject = computed(() =>
    projects.value.find((p) => p.id === selectedProjectId.value) || null,
  );

  const activeProjects = computed(() =>
    projects.value.filter((p) => ['planning', 'active'].includes(p.status)),
  );

  const projectCount = computed(() => projects.value.length);

  const activeSprint = computed(() =>
    sprints.value.find((s) => s.status === 'active') || null,
  );

  async function fetchAll() {
    loading.value = true;
    try {
      projects.value = (await listProjects()) as ProjectRecord[];
    } catch (e) {
      console.error('Failed to fetch projects', e);
    } finally {
      loading.value = false;
    }
  }

  async function create(params: { name: string; description?: string; template?: string; workDir?: string }) {
    const project = (await createProject(params)) as ProjectRecord;
    projects.value.unshift(project);
    return project;
  }

  async function update(id: string, params: Record<string, unknown>) {
    const project = (await updateProject(id, params)) as ProjectRecord;
    const idx = projects.value.findIndex((p) => p.id === id);
    if (idx !== -1) projects.value[idx] = project;
    return project;
  }

  async function remove(id: string) {
    await deleteProject(id);
    projects.value = projects.value.filter((p) => p.id !== id);
    if (selectedProjectId.value === id) selectedProjectId.value = null;
  }

  async function selectProject(id: string | null) {
    selectedProjectId.value = id;
    if (id) {
      await fetchSprints(id);
      await fetchBudget(id);
    }
  }

  async function fetchSprints(projectId: string) {
    try {
      sprints.value = (await listSprints(projectId)) as SprintRecord[];
    } catch (e) {
      console.error('Failed to fetch sprints', e);
    }
  }

  async function addSprint(params: { projectId: string; name: string; goal?: string; sprintType?: string }) {
    const sprint = (await createSprint(params)) as SprintRecord;
    sprints.value.unshift(sprint);
    return sprint;
  }

  async function doStartSprint(id: string) {
    const sprint = (await startSprint(id)) as SprintRecord;
    const idx = sprints.value.findIndex((s) => s.id === id);
    if (idx !== -1) sprints.value[idx] = sprint;
  }

  async function doEnterReview(id: string) {
    const sprint = (await enterSprintReview(id)) as SprintRecord;
    const idx = sprints.value.findIndex((s) => s.id === id);
    if (idx !== -1) sprints.value[idx] = sprint;
  }

  async function doCompleteSprint(id: string) {
    const sprint = (await completeSprint(id)) as SprintRecord;
    const idx = sprints.value.findIndex((s) => s.id === id);
    if (idx !== -1) sprints.value[idx] = sprint;
  }

  async function fetchBudget(projectId: string) {
    try {
      budget.value = (await getProjectBudget(projectId)) as BudgetStatus;
    } catch (e) {
      console.error('Failed to fetch budget', e);
    }
  }

  async function fetchSprintStatus(id: string) {
    return getSprintStatus(id);
  }

  async function fetchStats(projectId: string) {
    try {
      const stats = (await getProjectStats(projectId)) as ProjectStats;
      projectStats.value[projectId] = stats;
    } catch (e) {
      console.error('Failed to fetch project stats', e);
    }
  }

  async function fetchAllStats() {
    await Promise.all(projects.value.map((p) => fetchStats(p.id)));
  }

  return {
    projects,
    selectedProjectId,
    selectedProject,
    activeProjects,
    projectCount,
    sprints,
    activeSprint,
    budget,
    projectStats,
    loading,
    fetchAll,
    create,
    update,
    remove,
    selectProject,
    fetchSprints,
    addSprint,
    doStartSprint,
    doEnterReview,
    doCompleteSprint,
    fetchBudget,
    fetchSprintStatus,
    fetchStats,
    fetchAllStats,
  };
});

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useIpc } from '../composables/useIpc';

export interface SkillItem {
  name: string;
  path: string;
  source: 'system' | 'custom';
  scope: 'global' | 'project';
  projectPath?: string;
  enabled: boolean;
  content?: string;
  updatedAt?: string;
  fileSize?: number;
}

export interface HookItem {
  name: string;
  hookType: 'PreToolUse' | 'PostToolUse' | 'Stop';
  matcher: string;
  scope: 'global' | 'project';
  projectPath?: string;
  enabled: boolean;
  script?: string;
  updatedAt?: string;
  triggerCount?: number;
}

export interface HookLogEntry {
  id: number;
  hookName: string;
  hookType: string;
  triggerTime: string;
  triggerReason: string | null;
  result: 'blocked' | 'passed' | 'warned';
  details: string | null;
  sessionId: string | null;
  scope: string;
  projectPath: string | null;
}

export interface HookStats {
  total: number;
  blocked: number;
  passed: number;
  warned: number;
}

export const useHarnessStore = defineStore('harness', () => {
  const ipc = useIpc();

  // State
  const skills = ref<SkillItem[]>([]);
  const hooks = ref<HookItem[]>([]);
  const hookLogs = ref<HookLogEntry[]>([]);
  const hookStats = ref<HookStats>({ total: 0, blocked: 0, passed: 0, warned: 0 });
  const selectedSkillName = ref<string | null>(null);
  const selectedHookName = ref<string | null>(null);
  const selectedHookDetail = ref<HookItem & { script?: string } | null>(null);
  const selectedSkillDetail = ref<SkillItem & { content?: string } | null>(null);
  const activeTab = ref<'skill' | 'hook' | 'record' | 'session'>('skill');
  const loading = ref(false);
  const searchQuery = ref('');
  const projectFilter = ref('all');

  // Computed
  const selectedSkill = computed(() => {
    if (selectedSkillDetail.value && selectedSkillDetail.value.name === selectedSkillName.value) {
      return selectedSkillDetail.value;
    }
    return skills.value.find(s => s.name === selectedSkillName.value) ?? null;
  });
  const selectedHook = computed(() => {
    if (selectedHookDetail.value && selectedHookDetail.value.name === selectedHookName.value) {
      return selectedHookDetail.value;
    }
    return hooks.value.find(h => h.name === selectedHookName.value) ?? null;
  });
  const filteredSkills = computed(() => {
    let list = skills.value;
    if (projectFilter.value === 'all') {
      // 全部 = 只顯示全域
      list = list.filter(s => s.scope === 'global');
    } else {
      // 選擇特定子專案 = 只顯示該子專案的
      list = list.filter(s => s.scope === 'project' && s.projectPath === projectFilter.value);
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    return list;
  });
  const filteredHooks = computed(() => {
    let list = hooks.value;
    if (projectFilter.value === 'all') {
      // 全部 = 只顯示全域
      list = list.filter(h => h.scope === 'global');
    } else {
      // 選擇特定子專案 = 只顯示該子專案的
      list = list.filter(h => h.scope === 'project' && h.projectPath === projectFilter.value);
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q));
    }
    return list;
  });

  // Actions
  async function fetchSkills() {
    loading.value = true;
    try {
      const raw = await ipc.listSkills() as Array<{ name: string; source: string; scope: string; projectPath?: string; enabled: boolean }>;
      skills.value = raw.map(s => ({
        name: s.name,
        path: s.name,
        source: (s.source === 'user' ? 'custom' : 'system') as SkillItem['source'],
        scope: s.scope as 'global' | 'project',
        projectPath: s.projectPath,
        enabled: s.enabled,
      }));
    } catch (e) {
      console.error('Failed to fetch skills:', e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchHooks() {
    loading.value = true;
    try {
      const raw = await ipc.listHooks() as Array<{ name: string; source: string; scope: string; type: string; matcher: string; enabled: boolean; projectPath?: string }>;
      hooks.value = raw.map(h => ({
        name: h.name,
        hookType: h.type as HookItem['hookType'],
        matcher: h.matcher,
        scope: h.scope as 'global' | 'project',
        projectPath: h.projectPath,
        enabled: h.enabled,
      }));
    } catch (e) {
      console.error('Failed to fetch hooks:', e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchHookLogs(filters?: { hookName?: string; result?: string; scope?: string; projectPath?: string; limit?: number }) {
    try {
      const raw = await ipc.getHookLogs(filters ?? {}) as Array<Record<string, unknown>>;
      hookLogs.value = raw.map((r) => ({
        id: r.id as number,
        hookName: (r.hookName ?? r.hook_name) as string,
        hookType: (r.hookType ?? r.hook_type) as string,
        triggerTime: (r.triggerTime ?? r.trigger_time) as string,
        triggerReason: (r.triggerReason ?? r.trigger_reason) as string | null,
        result: r.result as 'blocked' | 'passed' | 'warned',
        details: r.details as string | null,
        sessionId: (r.sessionId ?? r.session_id) as string | null,
        scope: r.scope as string,
        projectPath: (r.projectPath ?? r.project_path) as string | null,
      }));
    } catch (e) {
      console.error('Failed to fetch hook logs:', e);
    }
  }

  async function fetchHookStats(projectPath?: string) {
    try {
      hookStats.value = await ipc.getHookStats(projectPath);
    } catch (e) {
      console.error('Failed to fetch hook stats:', e);
    }
  }

  // toggleSkill / toggleHook removed — all hooks & skills are always enabled

  async function selectSkill(name: string, scope?: string, projectPath?: string) {
    selectedSkillName.value = name;
    try {
      const detail = await ipc.getSkill(name, scope, projectPath) as { name: string; source: string; scope: string; projectPath?: string; enabled: boolean; content: string; deployedTo?: unknown };
      selectedSkillDetail.value = {
        name: detail.name,
        path: detail.name,
        source: (detail.source === 'user' ? 'custom' : 'system') as SkillItem['source'],
        scope: detail.scope as 'global' | 'project',
        projectPath: detail.projectPath,
        enabled: detail.enabled,
        content: detail.content,
      };
    } catch (e) {
      console.error('Failed to get skill detail:', e);
      selectedSkillDetail.value = null;
    }
  }

  async function selectHook(name: string, scope?: string, projectPath?: string) {
    selectedHookName.value = name;
    try {
      const detail = await ipc.getHook({ name, scope, projectPath }) as { name: string; source: string; scope: string; type: string; matcher: string; enabled: boolean; script: string; projectPath?: string };
      selectedHookDetail.value = {
        name: detail.name,
        hookType: detail.type as HookItem['hookType'],
        matcher: detail.matcher,
        scope: detail.scope as 'global' | 'project',
        projectPath: detail.projectPath,
        enabled: detail.enabled,
        script: detail.script,
      };
    } catch (e) {
      console.error('Failed to get hook detail:', e);
      selectedHookDetail.value = null;
    }
  }

  function setTab(tab: 'skill' | 'hook' | 'record' | 'session') {
    activeTab.value = tab;
    if (tab !== 'session') {
      searchQuery.value = '';
    }
  }

  return {
    skills, hooks, hookLogs, hookStats,
    selectedSkillName, selectedHookName, selectedSkill, selectedHook,
    selectedHookDetail, selectedSkillDetail,
    activeTab, loading, searchQuery, projectFilter,
    filteredSkills, filteredHooks,
    fetchSkills, fetchHooks, fetchHookLogs, fetchHookStats,
    selectSkill, selectHook, setTab,
  };
});

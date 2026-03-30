<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useHarnessStore } from '../../stores/harness';
import HookActivityChart from './HookActivityChart.vue';
import HookStatsPanel from './HookStatsPanel.vue';
import HookLogsTable from './HookLogsTable.vue';

const store = useHarnessStore();

// Filter state
const filterProject = ref('all');
const filterHook = ref('all');
const filterResult = ref('all');
const filterDateRange = ref('all');

// Derive unique project paths from hooks for the project dropdown
const projectOptions = computed(() => {
  const paths = new Set<string>();
  store.hooks.forEach((h) => {
    if (h.projectPath) paths.add(h.projectPath);
  });
  return Array.from(paths);
});

// Derive unique hook names
const hookNameOptions = computed(() => store.hooks.map((h) => h.name));

const hasAnyLogs = computed(() => store.hookLogs.length > 0);

// ── 7-day activity chart ──
const last7DaysData = computed(() => {
  const today = new Date();
  const days: { date: string; label: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

    const count = store.hookLogs.filter((log) => {
      return log.triggerTime.startsWith(dateStr);
    }).length;

    days.push({ date: dateStr, label, count });
  }

  return days;
});

const maxDayCount = computed(() => Math.max(...last7DaysData.value.map((d) => d.count), 1));

// ── Top 5 hooks ranking ──
const top5Hooks = computed(() => {
  const counts = new Map<string, number>();
  store.hookLogs.forEach((log) => {
    counts.set(log.hookName, (counts.get(log.hookName) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
});

const maxHookCount = computed(() => top5Hooks.value[0]?.count || 1);

// Build filters object and fetch
function buildFilters() {
  const filters: Record<string, string | number | undefined> = {};
  if (filterHook.value !== 'all') filters.hookName = filterHook.value;
  if (filterResult.value !== 'all') filters.result = filterResult.value;
  if (filterProject.value !== 'all') filters.projectPath = filterProject.value;
  if (filterDateRange.value !== 'all') filters.dateRange = filterDateRange.value;
  return filters;
}

async function refresh() {
  const filters = buildFilters();
  await Promise.all([
    store.fetchHookLogs(filters as Parameters<typeof store.fetchHookLogs>[0]),
    store.fetchHookStats(filters as Parameters<typeof store.fetchHookStats>[0]),
  ]);
}

watch([filterProject, filterHook, filterResult, filterDateRange], () => {
  refresh();
});

onMounted(() => {
  refresh();
});
</script>

<template>
  <div class="trigger-logs-tab">
    <!-- Left panel -->
    <div class="panel-left">
      <!-- Filter section -->
      <div class="filter-section">
        <div class="filter-label">{{ $t('harness.triggerLogs.filterTitle') }}</div>

        <div class="filter-group">
          <div class="filter-label">{{ $t('harness.triggerLogs.filterProject') }}</div>
          <div class="select-wrap">
            <select v-model="filterProject" class="filter-select">
              <option value="all">{{ $t('harness.triggerLogs.filterAllProjects') }}</option>
              <option v-for="p in projectOptions" :key="p" :value="p">{{ p }}</option>
            </select>
            <span class="select-arrow">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">{{ $t('harness.triggerLogs.filterHook') }}</div>
          <div class="select-wrap">
            <select v-model="filterHook" class="filter-select">
              <option value="all">{{ $t('harness.triggerLogs.filterAllHooks') }}</option>
              <option v-for="name in hookNameOptions" :key="name" :value="name">{{ name }}</option>
            </select>
            <span class="select-arrow">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">{{ $t('harness.triggerLogs.filterResult') }}</div>
          <div class="select-wrap">
            <select v-model="filterResult" class="filter-select">
              <option value="all">{{ $t('harness.triggerLogs.filterAllResults') }}</option>
              <option value="blocked">Blocked</option>
              <option value="passed">Passed</option>
              <option value="warned">Warning</option>
            </select>
            <span class="select-arrow">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">{{ $t('harness.triggerLogs.filterDateRange') }}</div>
          <div class="select-wrap">
            <select v-model="filterDateRange" class="filter-select">
              <option value="today">{{ $t('harness.triggerLogs.filterToday') }}</option>
              <option value="7d">{{ $t('harness.triggerLogs.filterLast7Days') }}</option>
              <option value="30d">{{ $t('harness.triggerLogs.filterLast30Days') }}</option>
              <option value="all">{{ $t('harness.triggerLogs.filterAll') }}</option>
            </select>
            <span class="select-arrow">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </div>
        </div>
      </div>

      <!-- Stats section -->
      <HookStatsPanel :stats="store.hookStats" />

      <!-- 7-day Activity Chart + Ranking -->
      <HookActivityChart
        :last7-days-data="last7DaysData"
        :max-day-count="maxDayCount"
        :top5-hooks="top5Hooks"
        :max-hook-count="maxHookCount"
      />

      <!-- Left empty state -->
      <div v-if="!hasAnyLogs" class="left-empty">
        <div class="empty-icon">📋</div>
        <div class="empty-title">{{ $t('harness.triggerLogs.noLogs') }}</div>
        <div class="empty-desc">{{ $t('harness.triggerLogs.noLogsDesc') }}</div>
      </div>
    </div>

    <!-- Right panel -->
    <HookLogsTable :logs="store.hookLogs" :has-any-logs="hasAnyLogs" />
  </div>
</template>

<style scoped>
/* ── Layout ── */
.trigger-logs-tab {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
}

/* ── Left Panel ── */
.panel-left {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border-default);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Filter Section ── */
.filter-section {
  padding: 14px;
  border-bottom: 1px solid var(--color-border-default);
}

.filter-group {
  margin-bottom: 4px;
}

.filter-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.select-wrap {
  position: relative;
  margin-bottom: 8px;
}

.filter-select {
  width: 100%;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  padding: 6px 28px 6px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.filter-select:hover {
  border-color: var(--color-border-light);
}

.filter-select:focus {
  border-color: var(--color-accent);
}

.select-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
  display: flex;
  align-items: center;
}

/* ── Left Empty State ── */
.left-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  text-align: center;
}

.left-empty .empty-icon {
  font-size: 40px;
  opacity: 0.4;
  margin-bottom: 10px;
}

.left-empty .empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.left-empty .empty-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* ── Scrollbar ── */
.panel-left::-webkit-scrollbar {
  width: 4px;
}

.panel-left::-webkit-scrollbar-track {
  background: transparent;
}

.panel-left::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 2px;
}
</style>

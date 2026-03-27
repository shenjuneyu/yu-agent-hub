<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useHarnessStore } from '../../stores/harness';

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

// Formatters
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toTimeString().slice(0, 8); // HH:mm:ss
  } catch {
    return iso;
  }
}

function hookTypeClass(hookType: string): string {
  if (hookType === 'PreToolUse') return 'tag-pre';
  if (hookType === 'PostToolUse') return 'tag-post';
  if (hookType === 'Stop') return 'tag-stop';
  return 'tag-pre';
}

function hookTypeLabel(hookType: string): string {
  if (hookType === 'PreToolUse') return 'Pre';
  if (hookType === 'PostToolUse') return 'Post';
  if (hookType === 'Stop') return 'Stop';
  return hookType;
}

function resultClass(result: string): string {
  if (result === 'blocked') return 'tag-blocked';
  if (result === 'passed') return 'tag-passed';
  if (result === 'warned') return 'tag-warning-tag';
  return 'tag-passed';
}

function resultLabel(result: string): string {
  if (result === 'blocked') return 'Blocked';
  if (result === 'passed') return 'Passed';
  if (result === 'warned') return 'Warning';
  return result;
}
</script>

<template>
  <div class="trigger-logs-tab">
    <!-- Left panel -->
    <div class="panel-left">
      <!-- Filter section -->
      <div class="filter-section" :class="{ 'filters-disabled': !hasAnyLogs }">
        <div class="filter-label">篩選條件</div>

        <div class="filter-group">
          <div class="filter-label">專案</div>
          <div class="select-wrap">
            <select v-model="filterProject" class="filter-select">
              <option value="all">全部專案</option>
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
          <div class="filter-label">Hook 名稱</div>
          <div class="select-wrap">
            <select v-model="filterHook" class="filter-select">
              <option value="all">全部 Hook</option>
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
          <div class="filter-label">執行結果</div>
          <div class="select-wrap">
            <select v-model="filterResult" class="filter-select">
              <option value="all">全部結果</option>
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
          <div class="filter-label">日期範圍</div>
          <div class="select-wrap">
            <select v-model="filterDateRange" class="filter-select">
              <option value="today">今日</option>
              <option value="7d">最近 7 天</option>
              <option value="30d">最近 30 天</option>
              <option value="all">全部</option>
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
      <div class="stats-section">
        <div class="filter-label stats-title">今日統計</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ store.hookStats.total }}</div>
            <div class="stat-label">總觸發次數</div>
          </div>
          <div class="stat-card stat-blocked">
            <div class="stat-value stat-value-danger">{{ store.hookStats.blocked }}</div>
            <div class="stat-label">已攔截</div>
          </div>
          <div class="stat-card stat-passed">
            <div class="stat-value stat-value-success">{{ store.hookStats.passed }}</div>
            <div class="stat-label">通過</div>
          </div>
          <div class="stat-card stat-warning">
            <div class="stat-value stat-value-warning">{{ store.hookStats.warned }}</div>
            <div class="stat-label">警告</div>
          </div>
        </div>
      </div>

      <!-- 7-day Activity Chart -->
      <div class="chart-section">
        <div class="filter-label chart-title">近 7 天活動</div>
        <div class="chart-bars">
          <div
            v-for="day in last7DaysData"
            :key="day.date"
            class="chart-bar-col"
          >
            <div class="bar-count">{{ day.count > 0 ? day.count : '' }}</div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: (day.count / maxDayCount * 100) + '%' }"
              ></div>
            </div>
            <div class="bar-label">{{ day.label }}</div>
          </div>
        </div>
      </div>

      <!-- Top 5 Hooks Ranking -->
      <div class="ranking-section">
        <div class="filter-label ranking-title">觸發排行</div>
        <div v-if="top5Hooks.length > 0" class="ranking-list">
          <div
            v-for="(hook, idx) in top5Hooks"
            :key="hook.name"
            class="ranking-item"
          >
            <span class="rank-index">{{ idx + 1 }}</span>
            <span class="rank-name" :title="hook.name">{{ hook.name }}</span>
            <div class="rank-bar-track">
              <div
                class="rank-bar-fill"
                :style="{ width: (hook.count / maxHookCount * 100) + '%' }"
              ></div>
            </div>
            <span class="rank-count">{{ hook.count }}</span>
          </div>
        </div>
        <div v-else class="ranking-empty">暫無排行數據</div>
      </div>

      <!-- Left empty state -->
      <div v-if="!hasAnyLogs" class="left-empty">
        <div class="empty-icon">📋</div>
        <div class="empty-title">尚無觸發紀錄</div>
        <div class="empty-desc">Hook 被觸發時將記錄在此，啟用 Hook 後開始監控</div>
      </div>
    </div>

    <!-- Right panel -->
    <div class="panel-right">
      <div v-if="hasAnyLogs" class="records-table-wrap">
        <table class="records-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>Hook 名稱</th>
              <th>類型</th>
              <th>觸發原因</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(log, idx) in store.hookLogs"
              :key="log.id"
              :class="{ 'row-even': idx % 2 === 1 }"
            >
              <td class="td-time">{{ formatTime(log.triggerTime) }}</td>
              <td class="td-hook">{{ log.hookName }}</td>
              <td class="td-type">
                <span class="tag" :class="hookTypeClass(log.hookType)">
                  {{ hookTypeLabel(log.hookType) }}
                </span>
              </td>
              <td class="td-reason">{{ log.triggerReason ?? '—' }}</td>
              <td class="td-result">
                <span class="tag" :class="resultClass(log.result)">
                  {{ resultLabel(log.result) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Right empty state -->
      <div v-else class="right-empty">
        <div class="empty-icon">📋</div>
        <div class="empty-title">尚無觸發紀錄</div>
        <div class="empty-desc">當 Hook 被觸發（Blocked / Passed / Warning）時，所有事件記錄將顯示在此</div>
      </div>
    </div>
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

.filters-disabled {
  opacity: 0.5;
  pointer-events: none;
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

/* ── Stats Section ── */
.stats-section {
  padding: 14px;
}

.stats-title {
  margin-bottom: 10px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text-primary);
}

.stat-value-danger {
  color: var(--color-danger);
}

.stat-value-success {
  color: var(--color-success);
}

.stat-value-warning {
  color: var(--color-warning);
}

.stat-label {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 2px;
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

/* ── Right Panel ── */
.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.records-table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* ── Records Table ── */
.records-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.records-table thead th {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-default);
  position: sticky;
  top: 0;
  z-index: 2;
  white-space: nowrap;
  text-align: left;
}

.records-table tbody tr {
  transition: background 0.12s;
  border-bottom: 1px solid var(--color-border-default);
}

.records-table tbody tr.row-even {
  background: rgba(255, 255, 255, 0.018);
}

.records-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.records-table td {
  padding: 9px 12px;
  vertical-align: middle;
}

.td-time {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.td-hook {
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.td-reason {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 11px;
  color: var(--color-text-secondary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-type,
.td-result {
  white-space: nowrap;
}

/* ── Tags ── */
.tag {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.6;
}

/* Hook type tags */
.tag-pre {
  background: rgba(108, 92, 231, 0.15);
  color: #a29bfe;
}

.tag-post {
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
}

.tag-stop {
  background: rgba(255, 146, 43, 0.15);
  color: #ff922b;
}

/* Result tags */
.tag-blocked {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.tag-passed {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.tag-warning-tag {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

/* ── Right Empty State ── */
.right-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 32px;
  text-align: center;
}

.right-empty .empty-icon {
  font-size: 40px;
  opacity: 0.4;
  margin-bottom: 12px;
}

.right-empty .empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.right-empty .empty-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  max-width: 340px;
}

/* ── 7-Day Activity Chart ── */
.chart-section {
  padding: 14px;
  border-top: 1px solid var(--color-border-default);
}

.chart-title {
  margin-bottom: 12px;
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 152px; /* 120px bar track + count label + date label */
}

.chart-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  height: 100%;
}

.bar-count {
  font-size: 9px;
  color: var(--color-text-muted);
  min-height: 14px;
  line-height: 14px;
  text-align: center;
}

.bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  max-height: 120px;
}

.bar-fill {
  width: 100%;
  min-height: 2px;
  background: var(--color-accent, #6366f1);
  border-radius: 3px 3px 0 0;
  transition: height 0.3s ease;
  opacity: 0.85;
}

.bar-fill:hover {
  opacity: 1;
}

.bar-label {
  margin-top: 5px;
  font-size: 9px;
  color: var(--color-text-muted);
  white-space: nowrap;
  text-align: center;
}

/* ── Top 5 Hooks Ranking ── */
.ranking-section {
  padding: 14px;
  border-top: 1px solid var(--color-border-default);
}

.ranking-title {
  margin-bottom: 10px;
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
}

.rank-index {
  width: 14px;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-align: right;
}

.rank-name {
  width: 108px;
  flex-shrink: 0;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.rank-bar-track {
  flex: 1;
  height: 6px;
  background: var(--color-bg-card, rgba(255,255,255,0.06));
  border-radius: 3px;
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  background: var(--color-accent, #6366f1);
  border-radius: 3px;
  transition: width 0.3s ease;
  opacity: 0.8;
}

.rank-count {
  flex-shrink: 0;
  width: 24px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.ranking-empty {
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 10px 0;
}

/* ── Scrollbar ── */
.panel-left::-webkit-scrollbar,
.records-table-wrap::-webkit-scrollbar {
  width: 4px;
}

.panel-left::-webkit-scrollbar-track,
.records-table-wrap::-webkit-scrollbar-track {
  background: transparent;
}

.panel-left::-webkit-scrollbar-thumb,
.records-table-wrap::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 2px;
}
</style>

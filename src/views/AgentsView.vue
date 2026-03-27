<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useAgentsStore } from '../stores/agents';
import BaseTag from '../components/common/BaseTag.vue';

const agentsStore = useAgentsStore();

const searchInput = ref('');
const filterDepartment = ref('');
const filterLevel = ref('');
const collapsedDepts = ref<Set<string>>(new Set());

onMounted(async () => {
  if (agentsStore.agents.length === 0) await agentsStore.fetchAll();
  if (agentsStore.departments.length === 0) await agentsStore.fetchDepartments();
});

function onSearchChange() {
  agentsStore.setFilterSearch(searchInput.value);
}

function onDepartmentChange() {
  agentsStore.setFilterDepartment(filterDepartment.value || null);
}

function onLevelChange() {
  agentsStore.setFilterLevel(filterLevel.value || null);
}

function toggleDept(deptId: string) {
  if (collapsedDepts.value.has(deptId)) {
    collapsedDepts.value.delete(deptId);
  } else {
    collapsedDepts.value.add(deptId);
  }
}

const levelColor: Record<string, 'purple' | 'blue'> = {
  L1: 'purple',
  L2: 'blue',
};

const modelColor: Record<string, 'yellow' | 'blue' | 'green'> = {
  opus: 'yellow',
  sonnet: 'blue',
  haiku: 'green',
};

// agentsByDepartment is a Map; convert to array for v-for
const departmentEntries = computed(() => {
  const result: Array<{ deptId: string; deptName: string; agents: typeof agentsStore.agents }> = [];
  for (const [deptId, agentList] of agentsStore.agentsByDepartment) {
    const deptInfo = agentsStore.departments.find((d) => d.id === deptId);
    result.push({
      deptId,
      deptName: deptInfo?.name || deptId,
      agents: agentList,
    });
  }
  return result;
});
</script>

<template>
  <div class="agents-view">
    <!-- Page Header -->
    <div class="agents-header">
      <h2 class="agents-title">Agent 團隊</h2>
      <span class="agents-count-badge">共 {{ agentsStore.agentCount }} 位</span>
      <div class="agents-header-spacer"></div>
      <div class="agents-search-wrap">
        <svg class="agents-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="searchInput"
          type="text"
          placeholder="搜尋 Agent..."
          class="agents-search-input"
          @input="onSearchChange"
        />
      </div>
      <select
        v-model="filterDepartment"
        class="agents-filter-select"
        @change="onDepartmentChange"
      >
        <option value="">全部部門</option>
        <option
          v-for="dept in agentsStore.departments"
          :key="dept.id"
          :value="dept.id"
        >
          {{ dept.name }}
        </option>
      </select>
      <select
        v-model="filterLevel"
        class="agents-filter-select"
        @change="onLevelChange"
      >
        <option value="">全部等級</option>
        <option value="L1">L1 主管</option>
        <option value="L2">L2 成員</option>
      </select>
    </div>

    <!-- Content Area -->
    <div class="agents-content">
      <!-- Loading State: skeleton -->
      <div v-if="agentsStore.loading" class="agents-skeleton-list">
        <div v-for="i in 2" :key="i" class="agents-skeleton-section">
          <div class="agents-sk-dept-header">
            <div class="agents-sk-block agents-sk-dept-name"></div>
            <div class="agents-sk-block agents-sk-dept-badge"></div>
          </div>
          <div class="agents-grid">
            <div v-for="j in 3" :key="j" class="agents-sk-card">
              <div class="agents-sk-row">
                <div class="agents-sk-circle agents-skeleton"></div>
                <div class="agents-sk-name-block">
                  <div class="agents-sk-block agents-sk-name agents-skeleton"></div>
                  <div class="agents-sk-block agents-sk-id agents-skeleton"></div>
                </div>
              </div>
              <div class="agents-sk-row">
                <div class="agents-sk-block agents-sk-tag agents-skeleton"></div>
                <div class="agents-sk-block agents-sk-tag agents-skeleton"></div>
              </div>
              <div class="agents-sk-block agents-sk-desc agents-skeleton"></div>
              <div class="agents-sk-block agents-sk-desc-short agents-skeleton"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="departmentEntries.length === 0" class="agents-empty">
        <div class="agents-empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        </div>
        <div class="agents-empty-title">找不到符合條件的 Agent</div>
        <div class="agents-empty-sub">嘗試調整篩選條件或清除搜尋關鍵字</div>
      </div>

      <!-- Department Groups -->
      <div v-else class="agents-dept-list">
        <div
          v-for="dept in departmentEntries"
          :key="dept.deptId"
          class="agents-dept-section"
        >
          <!-- Department Header -->
          <button
            class="agents-dept-header"
            :class="{ 'is-collapsed': collapsedDepts.has(dept.deptId) }"
            @click="toggleDept(dept.deptId)"
          >
            <span class="agents-dept-name">{{ dept.deptName }}</span>
            <span class="agents-dept-badge">{{ dept.agents.length }}</span>
            <span class="agents-dept-spacer"></span>
            <span class="agents-dept-toggle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>

          <!-- Agent Grid -->
          <div v-if="!collapsedDepts.has(dept.deptId)" class="agents-grid">
            <div
              v-for="agent in dept.agents"
              :key="agent.id"
              class="agent-card"
            >
              <!-- Row 1: Icon + Name + ID -->
              <div class="agent-row1">
                <span class="agent-emoji">{{ agentsStore.agentIcon(agent) }}</span>
                <div class="agent-name-block">
                  <div class="agent-name">{{ agentsStore.displayName(agent) }}</div>
                  <div class="agent-id">{{ agent.id }}</div>
                </div>
              </div>

              <!-- Row 2: Tags -->
              <div class="agent-row2">
                <BaseTag :color="levelColor[agent.level]">
                  {{ agent.level }}
                </BaseTag>
                <BaseTag :color="modelColor[agent.model] ?? 'blue'">
                  {{ agent.model }}
                </BaseTag>
              </div>

              <!-- Row 3: Description -->
              <p class="agent-desc">{{ agentsStore.agentBrief(agent) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page Layout ── */
.agents-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.agents-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.agents-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.3px;
}

.agents-count-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  padding: 2px 8px;
  border-radius: 20px;
}

.agents-header-spacer {
  flex: 1;
}

/* Search input with icon */
.agents-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.agents-search-icon {
  position: absolute;
  left: 10px;
  color: var(--color-text-muted);
  pointer-events: none;
  flex-shrink: 0;
}

.agents-search-input {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 10px 6px 30px;
  border-radius: 8px;
  outline: none;
  width: 180px;
  transition: border-color 0.15s;
}

.agents-search-input::placeholder {
  color: var(--color-text-muted);
}

.agents-search-input:focus {
  border-color: var(--color-accent);
}

/* Filter selects */
.agents-filter-select {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 28px 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%235c5e72' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  transition: border-color 0.15s;
}

.agents-filter-select:focus {
  border-color: var(--color-accent);
}

/* ── Content Scroll ── */
.agents-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.agents-content::-webkit-scrollbar {
  width: 4px;
}

.agents-content::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 2px;
}

/* ── Department List ── */
.agents-dept-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Department Section ── */
.agents-dept-section {
  display: flex;
  flex-direction: column;
}

.agents-dept-header {
  display: flex;
  align-items: center;
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  gap: 10px;
  color: var(--color-text-primary);
  font-family: inherit;
  text-align: left;
  transition: background 0.15s;
  margin-bottom: 12px;
}

.agents-dept-header:hover {
  background: var(--color-bg-card);
}

.agents-dept-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.2px;
}

.agents-dept-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-bg-hover);
  border: 1px solid var(--color-border-default);
  padding: 1px 7px;
  border-radius: 10px;
}

.agents-dept-spacer {
  flex: 1;
}

.agents-dept-toggle {
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.agents-dept-toggle svg {
  transition: transform 0.2s;
}

.agents-dept-header.is-collapsed .agents-dept-toggle svg {
  transform: rotate(-90deg);
}

/* ── Agent Grid ── */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

/* ── Agent Card ── */
.agent-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.agent-card:hover {
  background: var(--color-bg-card);
  border-color: var(--color-border-light);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.agent-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}

.agent-emoji {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.agent-name-block {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.agent-id {
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-row2 {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 7px;
}

.agent-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Empty State ── */
.agents-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 32px;
  gap: 12px;
  text-align: center;
}

.agents-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}

.agents-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.agents-empty-sub {
  font-size: 13px;
  color: var(--color-text-muted);
  max-width: 280px;
  line-height: 1.6;
}

/* ── Skeleton Loading ── */
@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

.agents-skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-card) 25%,
    var(--color-bg-hover) 50%,
    var(--color-bg-card) 75%
  );
  background-size: 1200px 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}

.agents-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.agents-skeleton-section {
  display: flex;
  flex-direction: column;
}

.agents-sk-dept-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 12px;
}

.agents-sk-block {
  border-radius: 4px;
}

.agents-sk-dept-name {
  width: 100px;
  height: 14px;
  background: var(--color-bg-card);
  animation: shimmer 1.4s infinite;
  background-size: 1200px 100%;
  background-image: linear-gradient(
    90deg,
    var(--color-bg-card) 25%,
    var(--color-bg-hover) 50%,
    var(--color-bg-card) 75%
  );
}

.agents-sk-dept-badge {
  width: 24px;
  height: 14px;
  background: var(--color-bg-hover);
  border-radius: 10px;
  animation: shimmer 1.4s infinite;
  background-size: 1200px 100%;
  background-image: linear-gradient(
    90deg,
    var(--color-bg-card) 25%,
    var(--color-bg-hover) 50%,
    var(--color-bg-card) 75%
  );
}

.agents-sk-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agents-sk-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.agents-sk-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agents-sk-name-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agents-sk-name  { width: 70%; height: 11px; }
.agents-sk-id    { width: 50%; height: 10px; }
.agents-sk-tag   { width: 32px; height: 18px; border-radius: 4px; }
.agents-sk-desc  { width: 100%; height: 10px; }
.agents-sk-desc-short { width: 75%; height: 10px; }
</style>

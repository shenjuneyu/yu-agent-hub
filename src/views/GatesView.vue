<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGatesStore } from '../stores/gates';
import { useProjectsStore } from '../stores/projects';
import BaseTag from '../components/common/BaseTag.vue';

const { t } = useI18n();
const gatesStore = useGatesStore();
const projectsStore = useProjectsStore();

const filterProjectId = ref('');
const filterStatus = ref('');

onMounted(async () => {
  if (projectsStore.projects.length === 0) await projectsStore.fetchAll();
  await gatesStore.fetchGates();
});

const gateTypeLabel = computed<Record<string, string>>(() => ({
  G0: t('gates.typeLabels.G0'),
  G1: t('gates.typeLabels.G1'),
  G2: t('gates.typeLabels.G2'),
  G3: t('gates.typeLabels.G3'),
  G4: t('gates.typeLabels.G4'),
  G5: t('gates.typeLabels.G5'),
  G6: t('gates.typeLabels.G6'),
}));

const gateStatusLabel = computed<Record<string, string>>(() => ({
  pending: t('gates.statusLabels.pending'),
  submitted: t('gates.statusLabels.submitted'),
  approved: t('gates.statusLabels.approved'),
  rejected: t('gates.statusLabels.rejected'),
}));

const gateStatusColor: Record<string, 'yellow' | 'blue' | 'green' | 'red'> = {
  pending: 'yellow',
  submitted: 'blue',
  approved: 'green',
  rejected: 'red',
};

const gateTypeColor: Record<string, 'purple' | 'blue' | 'yellow' | 'green' | 'red'> = {
  G0: 'purple',
  G1: 'blue',
  G2: 'yellow',
  G3: 'green',
  G4: 'blue',
  G5: 'yellow',
  G6: 'green',
};

const sortedGates = computed(() => {
  return [...gatesStore.gates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
});

const filteredGates = computed(() => {
  return sortedGates.value.filter((gate) => {
    if (filterProjectId.value && gate.projectId !== filterProjectId.value) return false;
    if (filterStatus.value && gate.status !== filterStatus.value) return false;
    return true;
  });
});

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="gates-view">
    <!-- Page Header -->
    <div class="gates-header">
      <h2 class="gates-title">{{ $t('gates.title') }}</h2>
      <div class="gates-filters">
        <select v-model="filterProjectId" class="filter-select">
          <option value="">{{ $t('gates.allProjects') }}</option>
          <option
            v-for="project in projectsStore.projects"
            :key="project.id"
            :value="project.id"
          >
            {{ project.name }}
          </option>
        </select>
        <select v-model="filterStatus" class="filter-select">
          <option value="">{{ $t('gates.allStatuses') }}</option>
          <option value="pending">{{ $t('gates.statusLabels.pending') }}</option>
          <option value="submitted">{{ $t('gates.statusLabels.submitted') }}</option>
          <option value="approved">{{ $t('gates.statusLabels.approved') }}</option>
          <option value="rejected">{{ $t('gates.statusLabels.rejected') }}</option>
        </select>
      </div>
    </div>

    <!-- Scrollable content area -->
    <div class="gates-scroll">

      <!-- Loading: Skeleton -->
      <div v-if="gatesStore.loading" class="timeline-list">
        <div class="timeline-line"></div>
        <div v-for="i in 4" :key="i" class="gate-entry">
          <div class="gate-icon pending" style="opacity: 0.3">G?</div>
          <div class="sk-card-wrap">
            <div class="sk-row">
              <div class="skeleton sk-line-sm" style="width: 80px"></div>
              <div class="skeleton sk-line-sm" style="width: 60px"></div>
              <div class="skeleton sk-line-sm" style="width: 70px; margin-left: auto"></div>
            </div>
            <div class="skeleton sk-line-lg" style="width: 200px"></div>
            <div class="skeleton sk-line-sm" style="width: 240px"></div>
            <div class="skeleton sk-line-md" style="width: 100%"></div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredGates.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="empty-title">{{ $t('gates.noRecords') }}</div>
        <div class="empty-sub">{{ $t('gates.noRecordsDesc') }}</div>
      </div>

      <!-- Timeline list -->
      <div v-else class="timeline-list">
        <div class="timeline-line"></div>
        <div
          v-for="gate in filteredGates"
          :key="gate.id"
          class="gate-entry"
        >
          <!-- Circle icon -->
          <div
            class="gate-icon"
            :class="gate.status"
          >
            {{ /^G\d$/.test(gate.gateType) ? gate.gateType : '✓' }}
          </div>

          <!-- Gate card -->
          <div class="gate-card">
            <!-- Row 1: tags + date -->
            <div class="gate-row1">
              <BaseTag :color="gateTypeColor[gate.gateType]">
                {{ gate.gateType }}&nbsp;{{ gateTypeLabel[gate.gateType] || gate.gateType }}
              </BaseTag>
              <BaseTag :color="gateStatusColor[gate.status]">
                {{ gateStatusLabel[gate.status] }}
              </BaseTag>
              <span class="tag-date">{{ formatDate(gate.createdAt) }}</span>
            </div>

            <!-- Row 2: project / sprint -->
            <div class="gate-row2">
              <span v-if="gate.projectName" class="project-name">{{ gate.projectName }}</span>
              <span v-if="gate.sprintName" class="sprint-sep">&nbsp;/&nbsp;</span>
              <span v-if="gate.sprintName" class="sprint-name">{{ gate.sprintName }}</span>
            </div>

            <!-- Row 3: submitter + reviewer -->
            <div v-if="gate.submittedBy" class="gate-row3">
              <div class="person-info">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                {{ $t('gates.submittedBy') }}:&nbsp;<strong>{{ gate.submittedBy }}</strong>
              </div>
              <span v-if="gate.reviewer" class="person-dot"></span>
              <div v-if="gate.reviewer" class="person-info">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                {{ $t('gates.reviewer') }}:&nbsp;<strong>{{ gate.reviewer }}</strong>
              </div>
            </div>

            <!-- Row 4: decision / comment -->
            <div v-if="gate.decision" class="gate-row4">
              "{{ gate.decision }}"
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.gates-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.gates-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.gates-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.3px;
}

.gates-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.filter-select {
  appearance: none;
  background-color: var(--color-bg-card);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%235c5e72' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 24px 6px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color 150ms ease;
}

.filter-select:focus {
  border-color: var(--color-accent);
}

/* ── Scroll area ── */
.gates-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.gates-scroll::-webkit-scrollbar {
  width: 4px;
}

.gates-scroll::-webkit-scrollbar-thumb {
  background: var(--color-border-light);
  border-radius: 2px;
}

/* ── Timeline ── */
.timeline-list {
  position: relative;
  padding-left: 52px;
}

.timeline-line {
  position: absolute;
  left: 19px;
  top: 16px;
  bottom: 16px;
  width: 1px;
  background: var(--color-border-default);
}

/* ── Gate Entry ── */
.gate-entry {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-bottom: 20px;
}

/* Circle icon */
.gate-icon {
  position: absolute;
  left: -33px;
  top: 10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: var(--color-bg-primary);
  flex-shrink: 0;
}

.gate-icon.pending {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.gate-icon.submitted {
  border-color: var(--color-info);
  color: var(--color-info);
}

.gate-icon.approved {
  border-color: var(--color-success);
  color: var(--color-success);
}

.gate-icon.rejected {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* ── Gate Card ── */
.gate-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  padding: 12px 14px;
  width: 100%;
  transition: all 150ms ease;
}

.gate-card:hover {
  border-color: var(--color-border-light);
  background: var(--color-bg-hover);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* Row 1: tags + date */
.gate-row1 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.tag-date {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-left: auto;
}

/* Row 2: project / sprint */
.gate-row2 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 6px;
}

.sprint-sep {
  color: var(--color-text-muted);
  font-weight: 400;
}

.sprint-name {
  color: var(--color-text-secondary);
  font-weight: 400;
}

/* Row 3: person info */
.gate-row3 {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.person-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.person-info strong {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.person-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-border-light);
  flex-shrink: 0;
}

/* Row 4: decision quote */
.gate-row4 {
  background: var(--color-bg-primary);
  border-left: 2px solid var(--color-border-light);
  border-radius: 0 8px 8px 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  font-style: italic;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 32px;
  gap: 12px;
  text-align: center;
}

.empty-icon {
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

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.empty-sub {
  font-size: 13px;
  color: var(--color-text-muted);
  max-width: 300px;
  line-height: 1.6;
}

/* ── Skeleton ── */
@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-card) 25%,
    var(--color-bg-hover) 50%,
    var(--color-bg-card) 75%
  );
  background-size: 1200px 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 6px;
}

.sk-line-sm  { height: 10px; border-radius: 4px; }
.sk-line-md  { height: 14px; border-radius: 4px; }
.sk-line-lg  { height: 16px; border-radius: 4px; }

.sk-card-wrap {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  padding: 14px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sk-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>

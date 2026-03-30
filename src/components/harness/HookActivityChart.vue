<template>
  <div class="chart-section">
    <div class="filter-label chart-title">{{ $t('harness.triggerLogs.activity7Days') }}</div>
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

    <!-- Top 5 Hooks Ranking -->
    <div class="ranking-section">
      <div class="filter-label ranking-title">{{ $t('harness.triggerLogs.triggerRanking') }}</div>
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
      <div v-else class="ranking-empty">{{ $t('harness.triggerLogs.noRanking') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  last7DaysData: { date: string; label: string; count: number }[];
  maxDayCount: number;
  top5Hooks: { name: string; count: number }[];
  maxHookCount: number;
}>();
</script>

<style scoped>
/* ── 7-Day Activity Chart ── */
.chart-section {
  padding: 14px;
  border-top: 1px solid var(--color-border-default);
}

.filter-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
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
  padding-top: 14px;
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
</style>

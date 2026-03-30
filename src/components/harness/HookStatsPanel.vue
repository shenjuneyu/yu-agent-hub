<template>
  <div class="stats-section">
    <div class="filter-label stats-title">{{ $t('harness.triggerLogs.todayStats') }}</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">{{ $t('harness.triggerLogs.statTotal') }}</div>
      </div>
      <div class="stat-card stat-blocked">
        <div class="stat-value stat-value-danger">{{ stats.blocked }}</div>
        <div class="stat-label">{{ $t('harness.triggerLogs.statBlocked') }}</div>
      </div>
      <div class="stat-card stat-passed">
        <div class="stat-value stat-value-success">{{ stats.passed }}</div>
        <div class="stat-label">{{ $t('harness.triggerLogs.statPassed') }}</div>
      </div>
      <div class="stat-card stat-warning">
        <div class="stat-value stat-value-warning">{{ stats.warned }}</div>
        <div class="stat-label">{{ $t('harness.triggerLogs.statWarning') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  stats: {
    total: number;
    blocked: number;
    passed: number;
    warned: number;
  };
}>();
</script>

<style scoped>
/* ── Stats Section ── */
.stats-section {
  padding: 14px;
}

.filter-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
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
</style>

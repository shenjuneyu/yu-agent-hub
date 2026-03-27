<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useGatesStore, type GateRecord, type GateType } from '../../stores/gates';
import GateChecklistPanel from './GateChecklistPanel.vue';
import BaseButton from '../common/BaseButton.vue';

const gatesStore = useGatesStore();

const expanded = ref(false);
const currentIndex = ref(0);

const submittedGates = computed(() =>
  gatesStore.gates.filter((g) => g.status === 'submitted'),
);

const hasGates = computed(() => submittedGates.value.length > 0);

const currentGate = computed((): GateRecord | null =>
  submittedGates.value[currentIndex.value] || null,
);

const currentChecklist = computed(() => {
  if (!currentGate.value) return null;
  return gatesStore.checklists.find((c) => c.gateType === currentGate.value!.gateType) || null;
});

const gateLabels: Record<GateType, string> = {
  G0: '需求確認',
  G1: '圖稿審核',
  G2: '程式碼審查',
  G3: '測試驗收',
  G4: '文件審查',
  G5: '部署就緒',
  G6: '正式發佈',
};

function cycleGate(dir: 1 | -1) {
  const len = submittedGates.value.length;
  if (len === 0) return;
  currentIndex.value = (currentIndex.value + dir + len) % len;
}

async function onSubmit(gateId: string, checklist: Record<string, boolean>) {
  await gatesStore.submit(gateId, 'user', checklist);
  await refreshGates();
}

async function onReview(
  gateId: string,
  decision: 'approved' | 'rejected',
  checklist?: Record<string, boolean>,
  comment?: string,
  itemReasons?: Record<string, string>,
) {
  await gatesStore.review(gateId, 'user', decision, comment, checklist, itemReasons);
  await refreshGates();
  // 如果審核後沒有更多待審，收起 Banner
  if (submittedGates.value.length === 0) {
    expanded.value = false;
    currentIndex.value = 0;
  } else if (currentIndex.value >= submittedGates.value.length) {
    currentIndex.value = 0;
  }
}

async function refreshGates() {
  // 重新抓取所有 submitted gates（不限專案）
  await gatesStore.fetchGates();
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await gatesStore.fetchChecklists();
  await refreshGates();
  // 每 30 秒輪詢一次
  pollTimer = setInterval(refreshGates, 30_000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

// 監聽 main process 推送的 gate 狀態變更
if (window.maestro?.on?.gateStatusChanged) {
  window.maestro.on.gateStatusChanged(() => {
    refreshGates();
  });
}
</script>

<template>
  <div v-if="hasGates" class="review-banner">
    <!-- Collapsed Banner -->
    <div
      class="review-banner__bar"
      @click="expanded = !expanded"
    >
      <div class="review-banner__bar-left">
        <span class="review-banner__count-label">
          {{ submittedGates.length }} 個關卡待審核
        </span>
        <span v-if="currentGate" class="review-banner__gate-info">
          — {{ currentGate.gateType }} {{ gateLabels[currentGate.gateType] }}
          <template v-if="currentGate.projectName">
            ({{ currentGate.projectName }}<template v-if="currentGate.sprintName"> / {{ currentGate.sprintName }}</template>)
          </template>
        </span>
      </div>
      <div class="review-banner__bar-right">
        <template v-if="submittedGates.length > 1">
          <BaseButton size="sm" variant="ghost" @click.stop="cycleGate(-1)">
            &lt;
          </BaseButton>
          <span class="review-banner__page-info">{{ currentIndex + 1 }}/{{ submittedGates.length }}</span>
          <BaseButton size="sm" variant="ghost" @click.stop="cycleGate(1)">
            &gt;
          </BaseButton>
        </template>
        <span class="review-banner__toggle-hint">{{ expanded ? '收起' : '展開' }}</span>
      </div>
    </div>

    <!-- Expanded: Checklist Panel -->
    <div v-if="expanded && currentGate" class="review-banner__panel">
      <GateChecklistPanel
        :gate="currentGate"
        :gate-type="currentGate.gateType"
        :checklist="currentChecklist"
        @submit="onSubmit"
        @review="onReview"
      />
    </div>
  </div>
</template>

<style scoped>
.review-banner {
  margin: 0 1rem 0.75rem;
}

.review-banner__bar {
  display: flex;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  border-radius: var(--radius-md);
  border: 1px solid rgba(234, 179, 8, 0.3);
  background: rgba(234, 179, 8, 0.1);
  padding: 0.625rem 1rem;
  transition: background 150ms;
}

.review-banner__bar:hover {
  background: rgba(234, 179, 8, 0.15);
}

.review-banner__bar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.review-banner__count-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-warning);
}

.review-banner__gate-info {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.review-banner__bar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.review-banner__page-info,
.review-banner__toggle-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.review-banner__panel {
  margin-top: 0.5rem;
}
</style>

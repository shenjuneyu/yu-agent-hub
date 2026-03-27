<script setup lang="ts">
import { computed } from 'vue';
import type { GateType } from '../../stores/gates';

interface GateNode {
  type: GateType;
  label: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'none';
  locked: boolean;
}

const props = defineProps<{
  pipeline: Record<GateType, { status: string } | null>;
  selectedGate?: GateType | null;
  lockedGates?: GateType[];
}>();

const emit = defineEmits<{
  select: [gateType: GateType];
}>();

const gateLabels: Record<GateType, string> = {
  G0: '需求確認',
  G1: '圖稿審核',
  G2: '程式碼審查',
  G3: '測試驗收',
  G4: '文件審查',
  G5: '部署就緒',
  G6: '正式發佈',
};

const ALL_GATE_TYPES: GateType[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];

/** 只顯示實際存在的 gate（動態 Sprint 類型可能只有部分 gate） */
const gateTypes = computed((): GateType[] => {
  const existing = ALL_GATE_TYPES.filter((t) => props.pipeline[t] !== null);
  return existing.length > 0 ? existing : ALL_GATE_TYPES;
});

function getNode(
  type: GateType,
  pipeline: Record<GateType, { status: string } | null>,
): GateNode {
  const gate = pipeline[type];
  return {
    type,
    label: gateLabels[type],
    status: gate ? (gate.status as GateNode['status']) : 'none',
    locked: props.lockedGates?.includes(type) ?? false,
  };
}

const statusColors: Record<string, string> = {
  none: 'bg-bg-hover border-border-default',
  pending: 'bg-yellow-500/20 border-yellow-500',
  submitted: 'bg-blue-500/20 border-blue-500',
  approved: 'bg-emerald-500/20 border-emerald-500',
  rejected: 'bg-red-500/20 border-red-500',
};

const statusDotColors: Record<string, string> = {
  none: 'bg-text-muted',
  pending: 'bg-yellow-400',
  submitted: 'bg-blue-400',
  approved: 'bg-emerald-400',
  rejected: 'bg-red-400',
};
</script>

<template>
  <div class="pipeline">
    <template v-for="(type, index) in gateTypes" :key="type">
      <!-- Gate node -->
      <button
        class="pipeline__node"
        :class="[
          selectedGate === type ? 'pipeline__node--selected' : '',
          getNode(type, pipeline).locked ? 'pipeline__node--locked' : '',
        ]"
        :data-status="getNode(type, pipeline).status"
        @click="emit('select', type)"
      >
        <!-- Lock icon -->
        <span
          v-if="getNode(type, pipeline).locked"
          class="pipeline__lock-badge"
          title="前一關卡尚未通過"
        >
          &#128274;
        </span>
        <div
          class="pipeline__dot"
          :data-dot-status="getNode(type, pipeline).status"
        >
          {{ type }}
        </div>
        <span class="pipeline__label">
          {{ gateLabels[type] }}
        </span>
      </button>

      <!-- Connector line -->
      <div
        v-if="index < gateTypes.length - 1"
        class="pipeline__connector"
        :data-approved="getNode(gateTypes[index]!, pipeline).status === 'approved'"
      />
    </template>
  </div>
</template>

<style scoped>
.pipeline {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* Gate node button */
.pipeline__node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border-default);
  background: var(--color-bg-hover);
  padding: 0.625rem 0.75rem;
  cursor: pointer;
  transition: transform 150ms, border-color 150ms, background 150ms;
}

.pipeline__node:hover {
  transform: scale(1.05);
}

/* Status-driven colors */
.pipeline__node[data-status="pending"] {
  background: rgba(234, 179, 8, 0.2);
  border-color: rgb(234, 179, 8);
}

.pipeline__node[data-status="submitted"] {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgb(59, 130, 246);
}

.pipeline__node[data-status="approved"] {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgb(16, 185, 129);
}

.pipeline__node[data-status="rejected"] {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgb(239, 68, 68);
}

.pipeline__node--selected {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.pipeline__node--locked {
  opacity: 0.5;
}

/* Lock badge */
.pipeline__lock-badge {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: var(--color-bg-card);
  font-size: 0.5rem;
  box-shadow: var(--shadow-sm);
}

/* Status dot / avatar */
.pipeline__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--color-text-muted);
  color: var(--color-bg-base);
}

.pipeline__dot[data-dot-status="none"] {
  background: var(--color-text-muted);
}

.pipeline__dot[data-dot-status="pending"] {
  background: rgb(250, 204, 21);
}

.pipeline__dot[data-dot-status="submitted"] {
  background: rgb(96, 165, 250);
}

.pipeline__dot[data-dot-status="approved"] {
  background: rgb(52, 211, 153);
}

.pipeline__dot[data-dot-status="rejected"] {
  background: rgb(248, 113, 113);
}

/* Label */
.pipeline__label {
  white-space: nowrap;
  font-size: 0.625rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

/* Connector */
.pipeline__connector {
  height: 2px;
  width: 1.5rem;
  flex-shrink: 0;
  background: var(--color-border-default);
}

.pipeline__connector[data-approved="true"] {
  background: rgb(16, 185, 129);
}
</style>

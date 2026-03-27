<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { GateType, GateRecord, GateChecklist, GateChecklistItem } from '../../stores/gates';
import BaseButton from '../common/BaseButton.vue';

const props = defineProps<{
  gate: GateRecord | null;
  gateType: GateType;
  checklist: GateChecklist | null;
  locked?: boolean;
}>();

const emit = defineEmits<{
  submit: [gateId: string, checklist: Record<string, boolean>];
  review: [
    gateId: string,
    decision: 'approved' | 'rejected',
    checklist?: Record<string, boolean>,
    comment?: string,
    itemReasons?: Record<string, string>,
  ];
}>();

const checkStates = ref<Record<string, boolean>>({});

/** 退回原因輸入模式 */
const rejectMode = ref(false);
const itemReasons = ref<Record<string, string>>({});
const rejectComment = ref('');

watch(
  () => props.gate,
  (gate) => {
    // 切換 gate 時重設退回模式
    rejectMode.value = false;
    rejectComment.value = '';
    itemReasons.value = {};

    if (gate?.checklist) {
      checkStates.value = { ...gate.checklist };
    } else if (props.checklist) {
      const states: Record<string, boolean> = {};
      for (const item of props.checklist.items) {
        states[item.label] = false;
      }
      checkStates.value = states;
    }
  },
  { immediate: true },
);

const allChecked = computed(() => {
  const values = Object.values(checkStates.value);
  return values.length > 0 && values.every(Boolean);
});

/** 不合格項目列表（用於退回原因輸入模式） */
const failedItems = computed((): string[] => {
  return Object.entries(checkStates.value)
    .filter(([, passed]) => !passed)
    .map(([item]) => item);
});

/** Item labels list (for iteration) */
const items = computed((): string[] => {
  if (props.gate?.checklist) return Object.keys(props.gate.checklist);
  return props.checklist?.items.map((i) => i.label) || [];
});

/** Map label → criteria for display */
const criteriaMap = computed((): Record<string, string> => {
  const map: Record<string, string> = {};
  if (props.checklist) {
    for (const item of props.checklist.items) {
      map[item.label] = item.criteria;
    }
  }
  return map;
});

const isDisabled = computed(() => props.locked || props.gate?.status === 'approved');

/** Items that were already checked (passed) when gate was rejected — lock them on resubmit */
const lockedItems = computed(() => {
  if (props.gate?.status !== 'rejected' || !props.gate?.checklist) return new Set<string>();
  return new Set(
    Object.entries(props.gate.checklist)
      .filter(([, passed]) => passed)
      .map(([item]) => item),
  );
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

const prevGateLabel = computed(() => {
  const order: GateType[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
  const idx = order.indexOf(props.gateType);
  if (idx <= 0) return '';
  const prev = order[idx - 1];
  return `${prev} — ${gateLabels[prev]}`;
});

const statusLabels: Record<string, string> = {
  pending: '待處理',
  submitted: '已提交',
  approved: '已通過',
  rejected: '已退回',
};

const statusColors: Record<string, string> = {
  pending: 'text-yellow-400',
  submitted: 'text-blue-400',
  approved: 'text-emerald-400',
  rejected: 'text-red-400',
};

/** 進入退回原因輸入模式 */
function enterRejectMode() {
  rejectMode.value = true;
  rejectComment.value = '';
  itemReasons.value = {};
}

/** 取消退回，回到 checklist */
function cancelReject() {
  rejectMode.value = false;
  rejectComment.value = '';
  itemReasons.value = {};
}

/** 確認退回 */
function confirmReject() {
  if (!props.gate) return;
  // 過濾掉空白原因
  const reasons: Record<string, string> = {};
  for (const [item, reason] of Object.entries(itemReasons.value)) {
    const trimmed = reason.trim();
    if (trimmed) reasons[item] = trimmed;
  }
  const comment = rejectComment.value.trim() || undefined;
  emit('review', props.gate.id, 'rejected', { ...checkStates.value }, comment, reasons);
  rejectMode.value = false;
}
</script>

<template>
  <div class="checklist-panel">
    <div class="checklist-panel__header">
      <h3 class="checklist-panel__title">
        {{ gateType }} — {{ gateLabels[gateType] }}
      </h3>
      <span
        v-if="gate"
        class="checklist-panel__status"
        :data-status="gate.status"
      >
        {{ statusLabels[gate.status] }}
      </span>
    </div>

    <!-- Locked hint -->
    <div v-if="locked && gate" class="checklist-panel__locked">
      <div class="checklist-panel__item-list">
        <label
          v-for="item in items"
          :key="item"
          class="checklist-panel__item checklist-panel__item--disabled"
        >
          <input type="checkbox" :checked="false" disabled class="checklist-panel__checkbox" />
          <span>{{ item }}</span>
        </label>
      </div>
      <p class="checklist-panel__locked-hint">
        需先通過 {{ prevGateLabel }} 關卡
      </p>
    </div>

    <!-- No gate yet -->
    <div v-else-if="!gate" class="checklist-panel__empty">
      <p class="checklist-panel__muted-text">尚未建立此關卡</p>
    </div>

    <!-- Reject reason input mode (step 2) -->
    <div v-else-if="rejectMode" class="checklist-panel__reject-mode">
      <p class="checklist-panel__reject-hint">
        請為每個不合格項目說明退回原因，填寫完成後點擊「確認退回」。
      </p>

      <div class="checklist-panel__failed-list">
        <div
          v-for="item in failedItems"
          :key="item"
          class="checklist-panel__failed-item"
        >
          <div class="checklist-panel__failed-label">{{ item }}</div>
          <input
            v-model="itemReasons[item]"
            type="text"
            :placeholder="'不合格原因...'"
            class="checklist-panel__reason-input"
          />
        </div>
      </div>

      <div class="checklist-panel__comment-block">
        <label class="checklist-panel__comment-label">整體退回備註（選填）</label>
        <textarea
          v-model="rejectComment"
          rows="2"
          placeholder="整體退回原因或建議..."
          class="checklist-panel__comment-textarea"
        />
      </div>

      <div class="checklist-panel__actions">
        <BaseButton size="sm" variant="danger" @click="confirmReject">
          確認退回
        </BaseButton>
        <BaseButton size="sm" @click="cancelReject">
          取消
        </BaseButton>
      </div>
    </div>

    <!-- Checklist -->
    <div v-else class="checklist-panel__body">
      <div class="checklist-panel__item-list">
        <div
          v-for="item in items"
          :key="item"
        >
          <label
            class="checklist-panel__item"
            :class="{ 'checklist-panel__item--faded': isDisabled && !lockedItems.has(item) }"
          >
            <input
              type="checkbox"
              :checked="checkStates[item]"
              :disabled="isDisabled || lockedItems.has(item)"
              class="checklist-panel__checkbox"
              @change="checkStates[item] = !checkStates[item]"
            />
            <div class="checklist-panel__item-content">
              <div class="checklist-panel__item-row">
                <span>{{ item }}</span>
                <span v-if="lockedItems.has(item)" class="checklist-panel__passed-badge">✓ 已通過</span>
              </div>
              <div v-if="criteriaMap[item]" class="checklist-panel__criteria">
                {{ criteriaMap[item] }}
              </div>
            </div>
          </label>
          <!-- 退回原因顯示（rejected 狀態 + 該項未通過 + 有原因） -->
          <div
            v-if="gate.status === 'rejected' && !checkStates[item] && gate.itemReasons?.[item]"
            class="checklist-panel__reject-reason"
          >
            不合格原因：{{ gate.itemReasons[item] }}
          </div>
        </div>
      </div>

      <!-- Reviewer hint -->
      <p v-if="gate.status === 'submitted'" class="checklist-panel__reviewer-hint">
        取消勾選不合格的項目，再點擊「退回」；全部合格則點擊「核准」。
      </p>

      <!-- Actions -->
      <div class="checklist-panel__actions">
        <BaseButton
          v-if="gate.status === 'pending' || gate.status === 'rejected'"
          size="sm"
          :disabled="!allChecked"
          @click="emit('submit', gate.id, { ...checkStates })"
        >
          {{ gate.status === 'rejected' ? '重新提交' : '提交審核' }}
        </BaseButton>
        <BaseButton
          v-if="gate.status === 'submitted'"
          size="sm"
          variant="success"
          :disabled="!allChecked"
          @click="emit('review', gate.id, 'approved')"
        >
          核准
        </BaseButton>
        <BaseButton
          v-if="gate.status === 'submitted'"
          size="sm"
          variant="danger"
          :disabled="allChecked"
          @click="enterRejectMode"
        >
          退回
        </BaseButton>
      </div>

      <!-- Meta info -->
      <div
        v-if="gate.submittedBy || gate.reviewer"
        class="checklist-panel__meta"
      >
        <div v-if="gate.submittedBy">提交者：{{ gate.submittedBy }}</div>
        <div v-if="gate.reviewer">審核者：{{ gate.reviewer }}</div>
        <div v-if="gate.decision">決議：{{ gate.decision }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checklist-panel {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-card);
  padding: 1.25rem;
}

.checklist-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.checklist-panel__title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}

.checklist-panel__status {
  font-size: 0.75rem;
  font-weight: 500;
}

.checklist-panel__status[data-status="pending"]  { color: var(--color-warning); }
.checklist-panel__status[data-status="submitted"] { color: var(--color-info); }
.checklist-panel__status[data-status="approved"]  { color: var(--color-success); }
.checklist-panel__status[data-status="rejected"]  { color: var(--color-error); }

/* Locked state */
.checklist-panel__locked,
.checklist-panel__empty {
  text-align: center;
}

.checklist-panel__locked-hint,
.checklist-panel__muted-text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0;
}

/* Item list */
.checklist-panel__item-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.checklist-panel__item {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-input);
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  transition: border-color 150ms;
  cursor: pointer;
}

.checklist-panel__item:hover {
  border-color: var(--color-border-light);
}

.checklist-panel__item--disabled {
  opacity: 0.4;
  cursor: default;
}

.checklist-panel__item--faded {
  opacity: 0.6;
}

.checklist-panel__checkbox {
  margin-top: 0.125rem;
  width: 0.875rem;
  height: 0.875rem;
  accent-color: var(--color-accent);
  flex-shrink: 0;
}

.checklist-panel__item-content {
  min-width: 0;
  flex: 1;
}

.checklist-panel__item-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.checklist-panel__passed-badge {
  font-size: 0.625rem;
  color: var(--color-success);
}

.checklist-panel__criteria {
  margin-top: 0.125rem;
  font-size: 0.6875rem;
  line-height: 1.3;
  color: var(--color-text-muted);
}

/* Reject reason display */
.checklist-panel__reject-reason {
  margin-left: 1.5rem;
  margin-top: 0.25rem;
  border-radius: var(--radius-sm);
  border-left: 2px solid rgba(var(--color-error-rgb, 239, 68, 68), 0.5);
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.05);
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  color: var(--color-error);
}

/* Reject mode */
.checklist-panel__reject-hint {
  margin-bottom: 0.75rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.checklist-panel__failed-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.checklist-panel__failed-item {
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--color-error-rgb, 239, 68, 68), 0.3);
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.05);
  padding: 0.5rem 0.75rem;
}

.checklist-panel__failed-label {
  margin-bottom: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-error);
}

.checklist-panel__reason-input {
  width: 100%;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-input);
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
}

.checklist-panel__reason-input::placeholder {
  color: var(--color-text-muted);
}

.checklist-panel__reason-input:focus {
  border-color: var(--color-accent);
}

/* Comment block */
.checklist-panel__comment-block {
  margin-bottom: 1rem;
}

.checklist-panel__comment-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.checklist-panel__comment-textarea {
  width: 100%;
  resize: none;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-input);
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
}

.checklist-panel__comment-textarea::placeholder {
  color: var(--color-text-muted);
}

.checklist-panel__comment-textarea:focus {
  border-color: var(--color-accent);
}

/* Actions */
.checklist-panel__actions {
  display: flex;
  gap: 0.5rem;
}

/* Reviewer hint */
.checklist-panel__reviewer-hint {
  margin-bottom: 0.75rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

/* Meta */
.checklist-panel__meta {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}
</style>

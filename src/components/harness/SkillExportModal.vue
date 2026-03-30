<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ t('harness.skill.exportTitle') }}</h3>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <textarea readonly class="json-display" :value="exportJson"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" @click="$emit('copy')">
          {{ copied ? t('harness.skill.copiedLabel') : t('harness.skill.copyLabel') }}
        </button>
        <button class="btn btn-outline" @click="$emit('close')">{{ t('harness.skill.close') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  show: boolean;
  exportJson: string;
  copied: boolean;
}>();

defineEmits<{
  close: [];
  copy: [];
}>();
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}

.modal-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border-default);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.json-display {
  width: 100%;
  min-height: 300px;
  box-sizing: border-box;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 12px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  resize: vertical;
  outline: none;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s;
}

.btn-outline:hover {
  background: var(--color-bg-hover);
}

.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border: none;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: opacity 0.15s;
}

.btn-primary:hover {
  opacity: 0.9;
}
</style>

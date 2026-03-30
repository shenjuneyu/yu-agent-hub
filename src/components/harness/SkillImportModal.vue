<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ t('harness.skill.importTitle') }}</h3>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <textarea
          :value="importJson"
          class="json-input"
          :placeholder="t('harness.skill.importJsonPlaceholder')"
          @input="$emit('update:importJson', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <div v-if="importError" class="import-error">{{ importError }}</div>
        <div v-if="importResult" class="import-result">
          <p v-if="importResult.imported.length">{{ t('harness.skill.importResultImported', { list: importResult.imported.join(', ') }) }}</p>
          <p v-if="importResult.skipped.length">{{ t('harness.skill.importResultSkipped', { list: importResult.skipped.join(', ') }) }}</p>
          <p v-if="importResult.overwritten.length">{{ t('harness.skill.importResultOverwritten', { list: importResult.overwritten.join(', ') }) }}</p>
          <p v-if="importResult.errors.length">{{ t('harness.skill.importResultErrors', { list: importResult.errors.join(', ') }) }}</p>
        </div>
      </div>
      <div class="modal-footer">
        <div v-if="showConflictChoice" class="conflict-choice">
          <span>{{ t('harness.skill.conflictDetected') }}</span>
          <button class="btn btn-outline" @click="$emit('doImport', 'skip')">{{ t('harness.skill.skipDuplicates') }}</button>
          <button class="btn btn-warning" @click="$emit('doImport', 'overwrite')">{{ t('harness.skill.overwriteDuplicates') }}</button>
        </div>
        <template v-else>
          <button class="btn btn-primary" @click="$emit('handleImport')" :disabled="!importJson.trim()">
            {{ t('harness.skill.doImport') }}
          </button>
          <button class="btn btn-outline" @click="$emit('close')">{{ t('harness.skill.close') }}</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  show: boolean;
  importJson: string;
  importError: string;
  importResult: { imported: string[]; skipped: string[]; overwritten: string[]; errors: string[] } | null;
  showConflictChoice: boolean;
}>();

defineEmits<{
  close: [];
  'update:importJson': [value: string];
  handleImport: [];
  doImport: [onConflict: 'skip' | 'overwrite'];
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

.json-input {
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

.json-input:focus {
  border-color: var(--color-accent);
}

.import-error {
  color: var(--color-danger, #ff6b6b);
  font-size: 12px;
  margin-top: 8px;
}

.import-result {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.import-result p {
  margin: 0;
}

.conflict-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 12px;
  color: var(--color-warning, #f59e0b);
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

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-warning {
  background: var(--color-warning, #f59e0b);
  color: #000;
  border: none;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: opacity 0.15s;
}

.btn-warning:hover {
  opacity: 0.9;
}
</style>

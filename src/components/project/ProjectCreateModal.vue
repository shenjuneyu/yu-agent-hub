<script setup lang="ts">
import { ref } from 'vue';
import BaseButton from '../common/BaseButton.vue';
import { useIpc } from '../../composables/useIpc';

const emit = defineEmits<{
  close: [];
  create: [params: { name: string; description: string; template: string; workDir: string }];
}>();

const ipc = useIpc();
const name = ref('');
const description = ref('');
const template = ref('blank');
const workDir = ref('');

const templates = [
  { value: 'blank', label: '空白專案' },
  { value: 'web-app', label: 'Web 應用' },
  { value: 'mobile-app', label: '行動應用' },
  { value: 'api-service', label: 'API 服務' },
  { value: 'library', label: '套件/函式庫' },
];

async function browseFolder() {
  const folder = await ipc.selectFolder();
  if (folder) workDir.value = folder;
}

function submit() {
  if (!name.value.trim() || !workDir.value.trim()) return;
  emit('create', {
    name: name.value.trim(),
    description: description.value.trim(),
    template: template.value,
    workDir: workDir.value.trim(),
  });
}
</script>

<template>
  <div
    class="modal-overlay"
    @click.self="emit('close')"
  >
    <div class="modal">
      <div class="modal__title">建立新專案</div>

      <div class="modal__field">
        <div class="modal__label">選擇模板</div>
        <div class="modal__template-grid">
          <button
            v-for="t in templates"
            :key="t.value"
            class="modal__template-card"
            :class="
              template === t.value
                ? 'modal__template-card--active'
                : 'modal__template-card--idle'
            "
            @click="template = t.value"
          >
            <span class="modal__template-icon">{{
              ({ blank: '📄', 'web-app': '🌐', 'mobile-app': '📱', 'api-service': '⚡', library: '📦' })[t.value]
            }}</span>
            <span class="modal__template-name">{{ t.label }}</span>
            <span class="modal__template-desc">{{
              ({ blank: '空白起始專案', 'web-app': 'React / Vue 前端應用', 'mobile-app': 'React Native / Flutter', 'api-service': 'Node.js / FastAPI 後端', library: 'NPM 套件 / SDK' })[t.value]
            }}</span>
          </button>
        </div>
      </div>

      <div class="modal__field">
        <label class="modal__label">專案名稱</label>
        <input
          v-model="name"
          class="modal__input"
          placeholder="例如：MyAwesomeApp"
          @keydown.enter="submit"
        />
      </div>

      <div class="modal__field">
        <label class="modal__label">工作目錄 <span class="modal__required">*</span></label>
        <div class="modal__workdir-row">
          <input
            v-model="workDir"
            class="modal__input modal__input--flex"
            placeholder="C:\projects\my-project"
            @keydown.enter="submit"
          />
          <BaseButton variant="ghost" size="sm" @click="browseFolder">瀏覽</BaseButton>
        </div>
        <p class="modal__hint">Session 將在此目錄下執行 Claude Code</p>
      </div>

      <div class="modal__field">
        <label class="modal__label">專案描述（選填）</label>
        <textarea
          v-model="description"
          class="modal__input modal__input--textarea"
          placeholder="簡短描述這個專案的目標與功能..."
        />
      </div>

      <div class="modal__actions">
        <BaseButton variant="ghost" size="sm" @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" size="sm" @click="submit">建立專案</BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.6);
}

/* Panel */
.modal {
  width: 480px;
  border-radius: 12px;
  border: 1px solid var(--color-border-light);
  background-color: var(--color-bg-secondary, var(--color-bg-card));
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  max-height: 90vh;
  overflow-y: auto;
}

.modal__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Fields */
.modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.modal__required {
  color: var(--color-error);
}

/* Inputs */
.modal__input {
  width: 100%;
  border-radius: 7px;
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-card);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s;
}

.modal__input::placeholder {
  color: var(--color-text-muted);
}

.modal__input:focus {
  border-color: var(--color-accent);
}

.modal__input--textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.5;
}

.modal__input--flex {
  flex: 1;
  min-width: 0;
  width: auto;
}

/* Work-dir row */
.modal__workdir-row {
  display: flex;
  gap: 8px;
}

.modal__hint {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Template grid — 2×2 card layout */
.modal__template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.modal__template-card {
  cursor: pointer;
  border-radius: 8px;
  border: 1px solid var(--color-border-default);
  padding: 12px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  background: none;
  font-family: inherit;
}

.modal__template-card--active {
  border-color: var(--color-accent);
  background-color: rgba(108, 92, 231, 0.1);
}

.modal__template-card--idle {
  border-color: var(--color-border-default);
  background-color: transparent;
}

.modal__template-card--idle:hover {
  border-color: var(--color-border-light);
  background-color: var(--color-bg-hover, rgba(255, 255, 255, 0.04));
}

.modal__template-icon {
  font-size: 20px;
  line-height: 1;
}

.modal__template-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.modal__template-desc {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Actions */
.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

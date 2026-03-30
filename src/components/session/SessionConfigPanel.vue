<template>
  <div>
    <!-- Task description -->
    <div class="launcher__field">
      <label class="launcher__label">{{ $t('sessions.launcher.taskDesc') }}</label>
      <textarea
        :value="task"
        rows="2"
        class="launcher__textarea"
        :placeholder="$t('sessions.launcher.taskPlaceholder')"
        @input="$emit('update:task', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <!-- Model + Max Turns -->
    <div class="launcher__grid-2">
      <div class="launcher__field">
        <label class="launcher__label">{{ $t('sessions.launcher.model') }}</label>
        <select
          :value="model"
          class="launcher__select"
          @change="$emit('update:model', ($event.target as HTMLSelectElement).value as 'opus' | 'sonnet' | 'haiku')"
        >
          <option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }} - {{ opt.desc }}
          </option>
        </select>
      </div>
      <div class="launcher__field">
        <label class="launcher__label">{{ $t('sessions.launcher.maxTurns') }}</label>
        <input
          :value="maxTurns"
          type="number"
          min="1"
          max="100"
          class="launcher__input"
          @input="$emit('update:maxTurns', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <!-- Prompt Preview -->
    <div class="launcher__field">
      <button class="launcher__preview-btn" @click="$emit('togglePreview')">
        {{ showPromptPreview ? $t('sessions.launcher.hidePrompt') : $t('sessions.launcher.previewPrompt') }}
      </button>
      <div v-if="showPromptPreview" class="launcher__prompt-preview">
        <pre class="launcher__prompt-pre">{{ promptPreview }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  task: string;
  model: 'opus' | 'sonnet' | 'haiku';
  maxTurns: number;
  showPromptPreview: boolean;
  promptPreview: string;
  modelOptions: { value: string; label: string; desc: string }[];
}>();

defineEmits<{
  'update:task': [value: string];
  'update:model': [value: 'opus' | 'sonnet' | 'haiku'];
  'update:maxTurns': [value: number];
  togglePreview: [];
}>();
</script>

<style scoped>
.launcher__field {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.launcher__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.launcher__input {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-hover);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 150ms ease;
}

.launcher__input::placeholder {
  color: var(--color-text-muted);
}

.launcher__input:focus {
  border-color: var(--color-accent);
}

.launcher__select {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-hover);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 150ms ease;
}

.launcher__select:focus {
  border-color: var(--color-accent);
}

.launcher__textarea {
  width: 100%;
  resize: none;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-hover);
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 150ms ease;
}

.launcher__textarea::placeholder {
  color: var(--color-text-muted);
}

.launcher__textarea:focus {
  border-color: var(--color-accent);
}

.launcher__grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.launcher__preview-btn {
  cursor: pointer;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--color-accent-light);
  padding: 0;
  text-align: left;
}

.launcher__preview-btn:hover {
  text-decoration: underline;
}

.launcher__prompt-preview {
  margin-top: 8px;
  max-height: 400px;
  overflow-y: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-base);
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.launcher__prompt-pre {
  white-space: pre-wrap;
}
</style>

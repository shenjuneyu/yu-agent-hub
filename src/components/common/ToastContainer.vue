<script setup lang="ts">
import { useUiStore } from '../../stores/ui';

const uiStore = useUiStore();

const typeClasses: Record<string, string> = {
  error: 'border-danger/40 bg-danger/5 text-danger',
  success: 'border-green-500/40 bg-green-500/5 text-green-500',
  warning: 'border-yellow-500/40 bg-yellow-500/5 text-yellow-500',
  info: 'border-blue-500/40 bg-blue-500/5 text-blue-500',
};

const typeIcons: Record<string, string> = {
  error: '✕',
  success: '✓',
  warning: '!',
  info: 'i',
};
</script>

<template>
  <div class="toast-container">
    <transition-group name="toast">
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="toast"
        :data-type="toast.type"
      >
        <span class="toast__icon" :data-type="toast.type">
          {{ typeIcons[toast.type] }}
        </span>
        <div class="toast__body">
          <p v-if="toast.title" class="toast__title">{{ toast.title }}</p>
          <p class="toast__message" :class="{ 'toast__message--indented': toast.title }">
            {{ toast.message }}
          </p>
        </div>
        <button
          class="toast__dismiss"
          @click="uiStore.dismissToast(toast.id)"
        >
          ✕
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  max-width: 360px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-card);
  padding: 0.75rem 1rem;
  box-shadow: var(--shadow-lg);
}

/* Type-specific toast colors */
.toast[data-type="error"] {
  border-color: rgba(var(--color-error-rgb, 239, 68, 68), 0.4);
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.05);
}

.toast[data-type="success"] {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.05);
}

.toast[data-type="warning"] {
  border-color: rgba(234, 179, 8, 0.4);
  background: rgba(234, 179, 8, 0.05);
}

.toast[data-type="info"] {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.05);
}

/* Icon */
.toast__icon {
  margin-top: 0.125rem;
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.toast__icon[data-type="error"]   { color: var(--color-error); }
.toast__icon[data-type="success"] { color: var(--color-success); }
.toast__icon[data-type="warning"] { color: var(--color-warning); }
.toast__icon[data-type="info"]    { color: var(--color-info); }

/* Body */
.toast__body {
  min-width: 0;
  flex: 1;
}

.toast__title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

.toast__message {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin: 0;
}

.toast__message--indented {
  margin-top: 0.125rem;
}

/* Dismiss button */
.toast__dismiss {
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  background: transparent;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  padding: 0;
  line-height: 1;
}

.toast__dismiss:hover {
  color: var(--color-text-primary);
}

@keyframes slideInUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.toast-enter-active {
  animation: slideInUp 200ms ease-out;
}

.toast-leave-active {
  transition: all 200ms ease-in;
}

.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>

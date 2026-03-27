<script setup lang="ts">
import { useUiStore } from '../../stores/ui';

const uiStore = useUiStore();
</script>

<template>
  <div class="error-toast-container">
    <transition-group name="toast">
      <div
        v-for="error in uiStore.errors"
        :key="error.id"
        class="error-toast"
        style="animation: slideInUp 200ms ease-out"
      >
        <span class="error-toast__icon">!</span>
        <div class="error-toast__body">
          <p class="error-toast__title">Error</p>
          <p class="error-toast__message">{{ error.message }}</p>
        </div>
        <button
          class="error-toast__dismiss"
          @click="uiStore.dismissError(error.id)"
        >
          ✕
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.error-toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.error-toast {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  max-width: 360px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--color-error-rgb, 239, 68, 68), 0.4);
  background: var(--color-bg-card);
  padding: 0.75rem 1rem;
  box-shadow: var(--shadow-lg);
}

.error-toast__icon {
  margin-top: 0.125rem;
  flex-shrink: 0;
  font-size: 0.875rem;
  color: var(--color-error);
}

.error-toast__body {
  min-width: 0;
  flex: 1;
}

.error-toast__title {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

.error-toast__message {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: 0;
}

.error-toast__dismiss {
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  background: transparent;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  padding: 0;
  line-height: 1;
}

.error-toast__dismiss:hover {
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

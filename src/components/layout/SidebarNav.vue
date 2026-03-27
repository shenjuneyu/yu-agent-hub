<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionsStore } from '../../stores/sessions';

const route = useRoute();
const sessionsStore = useSessionsStore();
const expanded = ref(false);

const navGroups = [
  [
    { to: '/', icon: '\u25EB', label: '\u5100\u8868\u677F', name: 'dashboard' },
    { to: '/sessions', icon: '\u25B7', label: '\u5DE5\u4F5C\u968E\u6BB5', name: 'sessions', badge: 'session' },
  ],
  [
    { to: '/projects', icon: '\u25A4', label: '\u5C08\u6848', name: 'projects' },
    { to: '/tasks', icon: '\u2630', label: '\u4EFB\u52D9', name: 'tasks' },
    { to: '/gates', icon: '\u25C8', label: '\u95DC\u5361', name: 'gates' },
    { to: '/agents', icon: '\u25C9', label: '\u5718\u968A', name: 'agents' },
    { to: '/harness', icon: '⚡', label: 'Harness', name: 'harness' },
    { to: '/knowledge', icon: '\uD83D\uDCDA', label: '\u77E5\u8B58\u5EAB', name: 'knowledge' },
  ],
  [
    { to: '/settings', icon: '\u2699', label: '\u8A2D\u5B9A', name: 'settings' },
  ],
];

function isActive(item: { to: string }): boolean {
  if (item.to === '/') return route.path === '/';
  return route.path.startsWith(item.to);
}
</script>

<template>
  <aside
    class="sidebar-rail"
    :class="{ 'sidebar-expanded': expanded }"
    @mouseenter="expanded = true"
    @mouseleave="expanded = false"
  >
    <!-- Brand -->
    <div class="flex items-center gap-2.5 px-3 pb-4 pt-2">
      <div
        class="flex h-7 w-7 min-w-[28px] items-center justify-center rounded-lg text-sm font-bold text-white"
        style="background: linear-gradient(135deg, #6c5ce7, #22d3ee)"
      >
        M
      </div>
      <span class="sidebar-label text-base font-bold tracking-tight">Maestro</span>
    </div>

    <!-- Nav groups -->
    <nav class="flex-1">
      <template v-for="(group, gi) in navGroups" :key="gi">
        <div v-if="gi > 0" class="mx-3 my-2 h-px bg-border-default"></div>
        <RouterLink
          v-for="item in group"
          :key="item.name"
          :to="item.to"
          class="group relative flex items-center gap-2.5 border-l-[3px] border-transparent px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-all duration-150 hover:bg-bg-hover hover:text-text-primary"
          :class="{
            '!border-l-accent !bg-bg-active !text-accent-light': isActive(item),
          }"
        >
          <span class="w-5 min-w-[20px] text-center text-[15px]">{{ item.icon }}</span>
          <span class="sidebar-label">{{ item.label }}</span>

          <!-- Badge dot (collapsed) -->
          <span
            v-if="item.badge === 'session' && sessionsStore.activeCount > 0"
            class="badge-dot bg-accent"
          ></span>

          <!-- Badge number (expanded) -->
          <span
            v-if="item.badge === 'session' && sessionsStore.activeCount > 0"
            class="sidebar-label ml-auto rounded-full bg-accent px-[7px] py-[2px] text-[10px] font-semibold text-white"
          >
            {{ sessionsStore.activeCount }}
          </span>
        </RouterLink>
      </template>
    </nav>

    <!-- Bottom version -->
    <div class="mt-auto flex items-center gap-2 px-4 py-2 text-[10px] text-text-muted">
      <span>v0.1</span>
      <span
        v-if="sessionsStore.activeCount > 0"
        class="sidebar-label ml-auto rounded-full bg-success-dim px-2 py-0.5 text-[10px] text-success"
      >
        {{ sessionsStore.activeCount }} 執行中
      </span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-rail {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 52px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  overflow: hidden;
  white-space: nowrap;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-default);
  transition: width 200ms ease;
}

.sidebar-expanded {
  width: 200px;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
}

/* Labels: hidden by default, fade in on expand */
.sidebar-label {
  opacity: 0;
  transition: opacity 150ms ease 50ms;
}
.sidebar-expanded .sidebar-label {
  opacity: 1;
}

/* Badge dot: shown when collapsed, hidden when expanded */
.badge-dot {
  position: absolute;
  top: 8px;
  left: 34px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: opacity 150ms;
}
.sidebar-expanded .badge-dot {
  opacity: 0;
}
</style>

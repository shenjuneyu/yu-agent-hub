<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SessionCard from './SessionCard.vue';
import type { ActiveSession, LayoutMode } from '../../stores/sessions';

const props = defineProps<{
  sessions: ActiveSession[];
  layout: LayoutMode;
  selectedSessionId: string | null;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  stop: [sessionId: string];
  remix: [session: ActiveSession];
  navigateToTask: [taskId: string];
  delegation: [session: ActiveSession];
  assignTask: [session: ActiveSession];
  requestSummary: [session: ActiveSession];
}>();

const { t } = useI18n();

const gridClass = computed(() => {
  switch (props.layout) {
    case 'single':
      return 'session-grid--single';
    case 'dual':
      return 'session-grid--dual';
    case 'triple':
      return 'session-grid--triple';
    case 'list':
    default:
      return 'session-grid--list';
  }
});

const gapClass = computed(() => 'session-grid--gap-grid');
</script>

<template>
  <div v-if="sessions.length === 0" class="session-grid__empty">
    {{ $t('sessions.grid.empty') }}
  </div>

  <div v-else class="session-grid" :class="[gridClass, gapClass]">
    <SessionCard
      v-for="session in sessions"
      :key="session.sessionId"
      :session="session"
      :selected="session.sessionId === selectedSessionId"
      @select="emit('select', $event)"
      @stop="emit('stop', $event)"
      @remix="emit('remix', $event)"
      @navigate-to-task="emit('navigateToTask', $event)"
      @delegation="emit('delegation', $event)"
      @assign-task="emit('assignTask', $event)"
      @request-summary="emit('requestSummary', $event)"
    />
  </div>
</template>

<style scoped>
.session-grid__empty {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background-color: var(--color-bg-card);
  padding: 32px;
  text-align: center;
  color: var(--color-text-muted);
}

.session-grid {
  display: grid;
}

.session-grid--single {
  grid-template-columns: 1fr;
}

.session-grid--dual {
  grid-template-columns: repeat(2, 1fr);
}

.session-grid--triple {
  grid-template-columns: repeat(3, 1fr);
}

.session-grid--gap-grid {
  gap: 12px;
}
</style>

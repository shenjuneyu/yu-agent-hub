<script setup lang="ts">
import { computed } from 'vue';
import BaseButton from '../common/BaseButton.vue';
import BaseTag from '../common/BaseTag.vue';
import { useAgentsStore, type AgentDefinition } from '../../stores/agents';

const props = defineProps<{
  agent: AgentDefinition;
}>();

const emit = defineEmits<{
  launch: [agentId: string];
  detail: [agentId: string];
}>();

const agentsStore = useAgentsStore();

const colorMap: Record<string, string> = {
  green: 'green',
  blue: 'blue',
  purple: 'purple',
  yellow: 'yellow',
  red: 'red',
};

const tagColor = computed(() => colorMap[props.agent.color] || 'purple');

const modelLabel: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

const icon = computed(() => agentsStore.agentIcon(props.agent));

const avatarBg = computed(() => {
  const colors: Record<string, string> = {
    green: 'bg-success/20 text-success',
    blue: 'bg-info/20 text-info',
    purple: 'bg-accent/20 text-accent-light',
    yellow: 'bg-warning/20 text-warning',
    red: 'bg-danger/20 text-danger',
  };
  return colors[props.agent.color] || colors.purple;
});

const departmentLabel: Record<string, string> = {
  engineering: '工程部',
  design: '設計部',
  product: '產品部',
  marketing: '行銷部',
  testing: '測試部',
  'project-management': '專案管理',
  'studio-operations': '營運部',
  bonus: '特殊',
};
</script>

<template>
  <div class="agent-card">
    <!-- Top: Avatar + Info -->
    <div class="agent-card__top">
      <div
        class="agent-card__avatar"
        :data-color="agent.color"
      >
        {{ icon }}
      </div>
      <div class="agent-card__info">
        <div class="agent-card__name">{{ agentsStore.displayName(agent) }}</div>
        <div class="agent-card__id">{{ agent.id }}</div>
        <div class="agent-card__description">{{ agent.description }}</div>
      </div>
    </div>

    <!-- Tags -->
    <div class="agent-card__tags">
      <BaseTag :color="tagColor as any">{{ agent.level }}</BaseTag>
      <BaseTag>{{ departmentLabel[agent.department] || agent.department }}</BaseTag>
      <BaseTag :color="agent.model === 'opus' ? 'red' : agent.model === 'haiku' ? 'green' : 'blue'">
        {{ modelLabel[agent.model] || agent.model }}
      </BaseTag>
    </div>

    <!-- Actions -->
    <div class="agent-card__actions">
      <BaseButton
        variant="primary"
        size="sm"
        class="agent-card__launch-btn"
        @click="emit('launch', agent.id)"
      >
        啟動
      </BaseButton>
      <BaseButton variant="ghost" size="sm" @click="emit('detail', agent.id)">
        詳情
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.agent-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-card);
  padding: 1rem;
  transition: border-color 150ms, box-shadow 150ms;
}

.agent-card:hover {
  border-color: var(--color-border-light);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* Top row */
.agent-card__top {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

/* Avatar */
.agent-card__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  font-size: 1.25rem;
  /* Default (purple) */
  background: rgba(var(--color-accent-rgb, 139, 92, 246), 0.2);
  color: var(--color-accent-light);
}

.agent-card__avatar[data-color="green"] {
  background: rgba(var(--color-success-rgb, 16, 185, 129), 0.2);
  color: var(--color-success);
}

.agent-card__avatar[data-color="blue"] {
  background: rgba(var(--color-info-rgb, 59, 130, 246), 0.2);
  color: var(--color-info);
}

.agent-card__avatar[data-color="purple"] {
  background: rgba(var(--color-accent-rgb, 139, 92, 246), 0.2);
  color: var(--color-accent-light);
}

.agent-card__avatar[data-color="yellow"] {
  background: rgba(var(--color-warning-rgb, 234, 179, 8), 0.2);
  color: var(--color-warning);
}

.agent-card__avatar[data-color="red"] {
  background: rgba(var(--color-error-rgb, 239, 68, 68), 0.2);
  color: var(--color-error);
}

/* Info */
.agent-card__info {
  min-width: 0;
  flex: 1;
}

.agent-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 600;
}

.agent-card__id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.6875rem;
  color: color-mix(in srgb, var(--color-text-muted) 60%, transparent);
}

.agent-card__description {
  margin-top: 0.125rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

/* Tags */
.agent-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

/* Actions */
.agent-card__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: auto;
}

.agent-card__launch-btn {
  flex: 1;
}
</style>

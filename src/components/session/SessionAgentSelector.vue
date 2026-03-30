<template>
  <div>
    <!-- Agent Selection -->
    <div class="launcher__field">
      <label class="launcher__label">{{ $t('sessions.launcher.selectAgent') }}</label>
      <div v-if="agentLocked && selectedAgent" class="launcher__agent-locked">
        <span class="launcher__agent-locked-name">{{ agentsStore.displayName(selectedAgent) }}</span>
        <span class="launcher__agent-locked-id">({{ selectedAgent.id }})</span>
      </div>
      <select
        v-else
        :value="selectedAgentId"
        class="launcher__select"
        @change="$emit('update:selectedAgentId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>{{ $t('sessions.launcher.selectAgentPlaceholder') }}</option>
        <optgroup
          v-for="[dept, agents] in agentsStore.agentsByDepartment"
          :key="dept"
          :label="departmentLabel[dept] || dept"
        >
          <option v-for="agent in agents" :key="agent.id" :value="agent.id">
            {{ agentsStore.displayName(agent) }} ({{ agent.level }})
          </option>
        </optgroup>
      </select>
    </div>

    <!-- Selected agent info -->
    <div v-if="selectedAgent" class="launcher__agent-info">
      <BaseTag :color="selectedAgent.color as any">{{ selectedAgent.level }}</BaseTag>
      <BaseTag>{{ departmentLabel[selectedAgent.department] || selectedAgent.department }}</BaseTag>
      <span class="launcher__agent-model">{{ selectedAgent.model }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseTag from '../common/BaseTag.vue';
import { useAgentsStore } from '../../stores/agents';

const agentsStore = useAgentsStore();

defineProps<{
  selectedAgentId: string;
  agentLocked: boolean;
  selectedAgent: ReturnType<typeof agentsStore.getById> | null;
  departmentLabel: Record<string, string>;
}>();

defineEmits<{
  'update:selectedAgentId': [value: string];
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

.launcher__agent-locked {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(108, 92, 231, 0.3);
  background-color: rgba(108, 92, 231, 0.05);
  padding: 8px 12px;
}

.launcher__agent-locked-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.launcher__agent-locked-id {
  font-size: 12px;
  color: var(--color-text-muted);
}

.launcher__agent-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.launcher__agent-model {
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>

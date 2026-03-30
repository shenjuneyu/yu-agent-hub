<template>
  <div class="skill-list">
    <!-- Empty State -->
    <div v-if="filteredSkills.length === 0 && !loading" class="empty-state">
      <span class="empty-icon">🧩</span>
      <p class="empty-title">{{ t('harness.skill.noSkills') }}</p>
      <p class="empty-desc">{{ t('harness.skill.noSkillsDesc') }}</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-state">
      {{ t('harness.skill.loading') }}
    </div>

    <!-- Items -->
    <div
      v-for="skill in filteredSkills"
      :key="skill.name"
      class="list-item"
      :class="{
        'is-selected': selectedSkillName === skill.name,
        'is-custom': skill.source === 'custom',
      }"
      @click="$emit('select', skill.name, skill.scope, skill.projectPath)"
    >
      <div class="item-main">
        <div class="item-top">
          <span class="item-name">{{ skill.name }}</span>
          <button
            v-if="skill.source === 'custom'"
            class="edit-btn"
            :title="t('harness.skill.editTitle')"
            @click.stop="$emit('edit', skill)"
          >✏️</button>
        </div>
        <span class="item-path">{{ skill.path }}</span>
        <div class="item-meta">
          <!-- Source tag -->
          <span v-if="skill.source === 'system'" class="tag tag-system">System</span>
          <span v-else class="tag tag-custom">Custom</span>
          <!-- Scope tag -->
          <span v-if="skill.scope === 'global'" class="tag tag-global">{{ t('harness.skill.scopeGlobal') }}</span>
          <span v-else class="tag tag-project">{{ projLabel(skill.projectPath) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { SkillItem } from '../../stores/harness';

const { t } = useI18n();

defineProps<{
  filteredSkills: SkillItem[];
  loading: boolean;
  selectedSkillName?: string;
}>();

defineEmits<{
  select: [name: string, scope: string, projectPath?: string];
  edit: [skill: SkillItem];
}>();

function projLabel(path?: string): string {
  if (!path) return t('harness.skill.unknownProject');
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}
</script>

<style scoped>
/* Skill List */
.skill-list {
  flex: 1;
  overflow-y: auto;
}

/* Empty / Loading States */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  gap: 8px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  opacity: 0.4;
  line-height: 1;
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  max-width: 220px;
  line-height: 1.5;
  text-align: center;
}

.loading-state {
  padding: 24px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

/* List Item */
.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-default);
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background 0.12s, border-left-color 0.12s;
  position: relative;
}

.list-item:hover {
  background: var(--color-bg-hover);
}

.list-item.is-selected {
  border-left-color: var(--color-accent);
  background: var(--color-bg-active);
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Edit button — hidden until hover on custom items */
.edit-btn {
  background: none;
  border: none;
  padding: 0 2px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  line-height: 1;
  flex-shrink: 0;
}

.list-item.is-custom:hover .edit-btn {
  opacity: 1;
}

.item-path {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

/* Tags */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
}

.tag-system {
  background: rgba(108, 92, 231, 0.2);
  color: var(--color-accent-light);
}

.tag-custom {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}

.tag-global {
  background: rgba(51, 154, 240, 0.2);
  color: var(--color-info);
}

.tag-project {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}
</style>

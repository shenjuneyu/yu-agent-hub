<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessagesStore, type MessageRecord } from '../stores/messages';
import { useProjectsStore } from '../stores/projects';
import BaseTag from '../components/common/BaseTag.vue';

const { t } = useI18n();
const messagesStore = useMessagesStore();
const projectsStore = useProjectsStore();

const filterProject = ref('');
const filterStatus = ref('');
const selectedMessage = ref<MessageRecord | null>(null);

const filteredMessages = computed(() => {
  let list = messagesStore.messages;
  if (filterProject.value) {
    list = list.filter((m) => m.projectId === filterProject.value);
  }
  if (filterStatus.value === 'unread') {
    list = list.filter((m) => m.status !== 'read');
  } else if (filterStatus.value === 'read') {
    list = list.filter((m) => m.status === 'read');
  }
  return list;
});

function selectMessage(msg: MessageRecord) {
  selectedMessage.value = msg;
  if (msg.status !== 'read') {
    messagesStore.markRead(msg.id);
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t('messages.justNow');
  if (diffMin < 60) return t('messages.minutesAgo', { n: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('messages.hoursAgo', { n: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  return t('messages.daysAgo', { n: diffDay });
}

function getProjectName(projectId: string | null): string {
  if (!projectId) return t('messages.noProject');
  const p = (projectsStore.projects as Array<{ id: string; name: string }>).find(
    (proj) => proj.id === projectId,
  );
  return p?.name || projectId;
}

const statusColor: Record<string, 'yellow' | 'green' | 'blue'> = {
  pending: 'yellow',
  delivered: 'blue',
  read: 'green',
};

async function handleMarkAllRead() {
  await messagesStore.markAllRead();
}

onMounted(async () => {
  if (projectsStore.projects.length === 0) {
    await projectsStore.fetchAll();
  }
  await messagesStore.fetchMessages({ limit: 100 });
});
</script>

<template>
  <div class="flex h-full">
    <!-- Message list -->
    <div class="flex w-[380px] min-w-[320px] flex-col border-r border-border-default">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-text-primary">{{ t('messages.title') }}</h2>
          <span
            v-if="messagesStore.unreadCount > 0"
            class="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white"
          >
            {{ messagesStore.unreadCount }}
          </span>
        </div>
        <button
          v-if="messagesStore.unreadCount > 0"
          class="text-xs text-text-secondary hover:text-accent"
          @click="handleMarkAllRead"
        >
          {{ t('messages.markAllRead') }}
        </button>
      </div>

      <!-- Filters -->
      <div class="flex gap-2 border-b border-border-default px-4 py-2">
        <select
          v-model="filterStatus"
          class="flex-1 rounded bg-bg-tertiary px-2 py-1 text-xs text-text-primary"
        >
          <option value="">{{ t('messages.allMessages') }}</option>
          <option value="unread">{{ t('messages.unread') }}</option>
          <option value="read">{{ t('messages.read') }}</option>
        </select>
        <select
          v-model="filterProject"
          class="flex-1 rounded bg-bg-tertiary px-2 py-1 text-xs text-text-primary"
        >
          <option value="">{{ t('messages.allProjects') }}</option>
          <option
            v-for="p in projectsStore.projects"
            :key="(p as any).id"
            :value="(p as any).id"
          >
            {{ (p as any).name }}
          </option>
        </select>
      </div>

      <!-- Message items -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-if="messagesStore.loading"
          class="flex items-center justify-center py-12 text-sm text-text-muted"
        >
          {{ t('messages.loading') }}
        </div>
        <div
          v-else-if="filteredMessages.length === 0"
          class="flex items-center justify-center py-12 text-sm text-text-muted"
        >
          {{ t('messages.empty') }}
        </div>
        <div
          v-for="msg in filteredMessages"
          v-else
          :key="msg.id"
          class="cursor-pointer border-b border-border-default px-4 py-3 transition-colors hover:bg-bg-hover"
          :class="{
            'bg-bg-active': selectedMessage?.id === msg.id,
            'border-l-2 border-l-accent': msg.status !== 'read',
          }"
          @click="selectMessage(msg)"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-text-primary">{{ msg.fromAgent }}</span>
            <span class="text-[10px] text-text-muted">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <div class="mt-1 flex items-center gap-1.5">
            <BaseTag :color="statusColor[msg.status] || 'blue'" size="sm">
              {{ msg.status }}
            </BaseTag>
            <span
              v-if="msg.projectId"
              class="text-[10px] text-text-muted"
            >
              {{ getProjectName(msg.projectId) }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-text-secondary">
            {{ msg.content.slice(0, 80) }}{{ msg.content.length > 80 ? '...' : '' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Message detail -->
    <div class="flex flex-1 flex-col">
      <div
        v-if="!selectedMessage"
        class="flex flex-1 items-center justify-center text-sm text-text-muted"
      >
        {{ t('messages.selectToRead') }}
      </div>
      <template v-else>
        <!-- Detail header -->
        <div class="border-b border-border-default px-6 py-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-text-primary">
              {{ t('messages.from') }}: {{ selectedMessage.fromAgent }}
            </h3>
            <BaseTag :color="statusColor[selectedMessage.status] || 'blue'" size="sm">
              {{ selectedMessage.status }}
            </BaseTag>
          </div>
          <div class="mt-1 flex items-center gap-3 text-xs text-text-muted">
            <span>{{ t('messages.to') }}: {{ selectedMessage.toAgent }}</span>
            <span>{{ new Date(selectedMessage.createdAt).toLocaleString() }}</span>
            <span v-if="selectedMessage.projectId">
              {{ t('messages.project') }}: {{ getProjectName(selectedMessage.projectId) }}
            </span>
          </div>
        </div>
        <!-- Detail body -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <pre class="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{{ selectedMessage.content }}</pre>
        </div>
      </template>
    </div>
  </div>
</template>

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useIpc } from '../composables/useIpc';

export type MessageStatus = 'pending' | 'delivered' | 'read';

export interface MessageRecord {
  id: string;
  fromAgent: string;
  toAgent: string;
  content: string;
  status: MessageStatus;
  projectId: string | null;
  sessionId: string | null;
  replyTo: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export const useMessagesStore = defineStore('messages', () => {
  const { listMessages, markMessageRead, getMessageUnreadCount, onMessageCreated, onMessageDelivered, onMessageRead } = useIpc();

  const messages = ref<MessageRecord[]>([]);
  const loading = ref(false);
  const currentProjectId = ref<string | null>(null);
  const currentAgentId = ref<string | null>(null);
  const unreadCount = ref(0);

  const unreadMessages = computed(() =>
    messages.value.filter((m) => m.status !== 'read'),
  );

  const readMessages = computed(() =>
    messages.value.filter((m) => m.status === 'read'),
  );

  async function fetchMessages(filters?: {
    agent?: string;
    toAgent?: string;
    fromAgent?: string;
    projectId?: string;
    status?: MessageStatus;
    limit?: number;
  }) {
    loading.value = true;
    try {
      const result = await listMessages(filters);
      messages.value = result as MessageRecord[];
    } finally {
      loading.value = false;
    }
  }

  async function fetchUnreadCount(agentId: string, projectId?: string | null) {
    const result = await getMessageUnreadCount(agentId, projectId);
    unreadCount.value = result.count;
    return result.count;
  }

  async function markRead(messageId: string) {
    await markMessageRead(messageId);
    const msg = messages.value.find((m) => m.id === messageId);
    if (msg) {
      msg.status = 'read';
      msg.readAt = new Date().toISOString();
    }
    // Update unread count
    if (currentAgentId.value) {
      await fetchUnreadCount(currentAgentId.value, currentProjectId.value);
    }
  }

  async function markAllRead() {
    const unread = messages.value.filter((m) => m.status !== 'read');
    const now = new Date().toISOString();
    await Promise.all(unread.map((msg) => markMessageRead(msg.id)));
    for (const msg of unread) {
      msg.status = 'read';
      msg.readAt = now;
    }
    unreadCount.value = 0;
  }

  function setContext(agentId: string | null, projectId: string | null) {
    currentAgentId.value = agentId;
    currentProjectId.value = projectId;
  }

  function setupListeners() {
    onMessageCreated(handleMessageCreated);
    onMessageDelivered((data: unknown) => {
      const { messageId } = data as { messageId: string };
      const msg = messages.value.find((m) => m.id === messageId);
      if (msg) msg.status = 'delivered';
    });
    onMessageRead((data: unknown) => {
      const { messageId } = data as { messageId: string };
      const msg = messages.value.find((m) => m.id === messageId);
      if (msg && msg.status !== 'read') {
        msg.status = 'read';
        msg.readAt = new Date().toISOString();
        if (unreadCount.value > 0) unreadCount.value--;
      }
    });
  }

  function handleMessageCreated(data: unknown) {
    const msg = data as MessageRecord;
    // Only add if it matches current context
    if (currentProjectId.value && msg.projectId && msg.projectId !== currentProjectId.value) return;
    // Avoid duplicates
    if (!messages.value.find((m) => m.id === msg.id)) {
      messages.value.unshift(msg);
    }
    if (msg.status !== 'read') {
      unreadCount.value++;
    }
  }

  return {
    messages,
    loading,
    currentProjectId,
    currentAgentId,
    unreadCount,
    unreadMessages,
    readMessages,
    setupListeners,
    fetchMessages,
    fetchUnreadCount,
    markRead,
    markAllRead,
    setContext,
    handleMessageCreated,
  };
});

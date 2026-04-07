import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { messageBroker } from '../services/message-broker';
import type { SendMessageParams, MessageFilters } from '../types';

export function registerMessageHandlers(): void {
  ipcMain.handle(IpcChannels.MESSAGE_SEND, (_event, params: SendMessageParams) => {
    return messageBroker.send(params);
  });

  ipcMain.handle(IpcChannels.MESSAGE_LIST, (_event, filters: MessageFilters) => {
    return messageBroker.listByFilters(filters);
  });

  ipcMain.handle(IpcChannels.MESSAGE_GET, (_event, id: string) => {
    return messageBroker.getById(id);
  });

  ipcMain.handle(IpcChannels.MESSAGE_MARK_READ, (_event, id: string) => {
    messageBroker.markRead(id);
    return { success: true };
  });

  ipcMain.handle(IpcChannels.MESSAGE_UNREAD_COUNT, (_event, agentId: string, projectId?: string | null) => {
    return { count: messageBroker.getUnreadCount(agentId, projectId) };
  });
}

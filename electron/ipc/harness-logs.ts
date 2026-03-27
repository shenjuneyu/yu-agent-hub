import { ipcMain } from 'electron';
import { IpcChannels } from '../types/ipc';
import { hookManager } from '../services/hook-manager';
import { logger } from '../utils/logger';

export function registerHarnessLogHandlers(): void {
  ipcMain.handle(IpcChannels.HOOK_GET_LOGS, async (_event, filters?) => {
    try {
      return hookManager.queryHookLogs(filters);
    } catch (err) {
      logger.error('Failed to get hook logs', err);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.HOOK_GET_STATS, async (_event, projectPath?: string) => {
    try {
      return hookManager.getHookStats(projectPath);
    } catch (err) {
      logger.error('Failed to get hook stats', err);
      throw err;
    }
  });
}

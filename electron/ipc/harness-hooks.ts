import { ipcMain } from 'electron';
import { IpcChannels } from '../types/ipc';
import { hookManager } from '../services/hook-manager';
import { logger } from '../utils/logger';

export function registerHarnessHookHandlers(): void {
  ipcMain.handle(IpcChannels.HOOK_LIST, async (_event, params?: { projectPath?: string }) => {
    try {
      return hookManager.listHooks(params?.projectPath);
    } catch (err) {
      logger.error(`hook:list failed: ${err}`);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.HOOK_GET, async (_event, params: { name: string; scope?: string; projectPath?: string }) => {
    try {
      return hookManager.getHook(params.name, params.scope, params.projectPath);
    } catch (err) {
      logger.error(`hook:get failed: ${err}`);
      throw err;
    }
  });

  ipcMain.handle(
    IpcChannels.HOOK_CREATE,
    async (_event, params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }) => {
      try {
        hookManager.createHook(params);
        return { success: true };
      } catch (err) {
        logger.error(`hook:create failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.HOOK_UPDATE,
    async (_event, params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }) => {
      try {
        hookManager.updateHook(params);
        return { success: true };
      } catch (err) {
        logger.error(`hook:update failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(IpcChannels.HOOK_DELETE, async (_event, params: { name: string; scope?: string; projectPath?: string }) => {
    try {
      hookManager.deleteHook(params.name, params.scope, params.projectPath);
      return { success: true };
    } catch (err) {
      logger.error(`hook:delete failed: ${err}`);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.HOOK_TOGGLE, async (_event, params: { name: string; enabled: boolean; scope?: string; projectPath?: string }) => {
    try {
      hookManager.toggleHook(params.name, params.enabled, params.scope, params.projectPath);
      return { success: true };
    } catch (err) {
      logger.error(`hook:toggle failed: ${err}`);
      throw err;
    }
  });
}

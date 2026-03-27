import { ipcMain } from 'electron';
import { IpcChannels } from '../types/ipc';
import { hookManager } from '../services/hook-manager';
import { logger } from '../utils/logger';

export function registerHookHandlers(): void {
  ipcMain.handle(IpcChannels.HOOK_GET_CONFIG, async (_event, workDir: string) => {
    try {
      return hookManager.getHookConfig(workDir);
    } catch (err) {
      logger.error(`Failed to get hook config: ${err}`);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.HOOK_UPDATE_CONFIG, async (_event, params: { workDir: string; autoInject?: boolean; stopValidatorEnabled?: boolean }) => {
    try {
      if (params.stopValidatorEnabled) {
        hookManager.generateStopValidator(params.workDir);
        hookManager.writeHookSettings(params.workDir);
      }
      return { success: true };
    } catch (err) {
      logger.error(`Failed to update hook config: ${err}`);
      throw err;
    }
  });
}

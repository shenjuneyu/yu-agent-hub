import { ipcMain } from 'electron';
import { IpcChannels } from '../types/ipc';
import { skillManager, SkillExportBundle } from '../services/skill-manager';
import { logger } from '../utils/logger';

export function registerHarnessHandlers(): void {
  ipcMain.handle(IpcChannels.SKILL_LIST, async (_event, params?: { projectPath?: string }) => {
    try {
      return skillManager.list(params?.projectPath);
    } catch (err) {
      logger.error(`skill:list failed: ${err}`);
      throw err;
    }
  });

  ipcMain.handle(
    IpcChannels.SKILL_GET,
    async (_event, params: { name: string; scope?: string; projectPath?: string }) => {
      try {
        return skillManager.get(params.name, params.scope, params.projectPath);
      } catch (err) {
        logger.error(`skill:get failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_CREATE,
    async (_event, params: { name: string; content: string; scope?: string; projectPath?: string }) => {
      try {
        return skillManager.create(params.name, params.content, params.scope, params.projectPath);
      } catch (err) {
        logger.error(`skill:create failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_UPDATE,
    async (_event, params: { name: string; content: string; scope?: string; projectPath?: string }) => {
      try {
        return skillManager.update(params.name, params.content, params.scope, params.projectPath);
      } catch (err) {
        logger.error(`skill:update failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_DELETE,
    async (_event, params: { name: string; scope?: string; projectPath?: string }) => {
      try {
        return skillManager.delete(params.name, params.scope, params.projectPath);
      } catch (err) {
        logger.error(`skill:delete failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_DEPLOY,
    async (_event, params: { name: string; projects: string[] }) => {
      try {
        return skillManager.deploy(params.name, params.projects);
      } catch (err) {
        logger.error(`skill:deploy failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_TOGGLE,
    async (_event, params: { name: string; enabled: boolean; scope?: string; projectPath?: string }) => {
      try {
        return skillManager.toggle(params.name, params.enabled, params.scope, params.projectPath);
      } catch (err) {
        logger.error(`skill:toggle failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_EXPORT,
    async (_event, params: { names: string[] }) => {
      try {
        return skillManager.exportBundle(params.names);
      } catch (err) {
        logger.error(`skill:export failed: ${err}`);
        throw err;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.SKILL_IMPORT,
    async (_event, params: { bundle: SkillExportBundle; onConflict: 'skip' | 'overwrite' }) => {
      try {
        return skillManager.importBundle(params.bundle, params.onConflict);
      } catch (err) {
        logger.error(`skill:import failed: ${err}`);
        throw err;
      }
    },
  );
}

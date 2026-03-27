/**
 * IPC handlers for ProjectSyncService.
 *
 * Channels:
 *   project-sync:start   { projectId, workDir } → void
 *   project-sync:stop    { projectId }           → void
 *   project-sync:full    { projectId, workDir }  → SyncResult
 *
 * Push event (Main → Renderer):
 *   project-sync:status  FileSyncedData
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { projectSync } from '../services/project-sync';
import { logger } from '../utils/logger';

export function registerProjectSyncHandlers(): void {
  // Start watching a project directory
  ipcMain.handle(
    IpcChannels.PROJECT_SYNC_START,
    (_e, params: { projectId: string; workDir: string }) => {
      try {
        projectSync.startWatch(params.projectId, params.workDir);
        return { success: true };
      } catch (err) {
        logger.warn(`project-sync:start error for project ${params.projectId}`, err);
        return { success: false, error: String(err) };
      }
    },
  );

  // Stop watching a project directory
  ipcMain.handle(
    IpcChannels.PROJECT_SYNC_STOP,
    (_e, params: { projectId: string }) => {
      try {
        projectSync.stopWatch(params.projectId);
        return { success: true };
      } catch (err) {
        logger.warn(`project-sync:stop error for project ${params.projectId}`, err);
        return { success: false, error: String(err) };
      }
    },
  );

  // Trigger a full (one-shot) sync for a project
  ipcMain.handle(
    IpcChannels.PROJECT_SYNC_FULL,
    async (_e, params: { projectId: string; workDir: string }) => {
      try {
        const result = await projectSync.fullSync(params.projectId, params.workDir);
        return result;
      } catch (err) {
        logger.warn(`project-sync:full error for project ${params.projectId}`, err);
        return { tasksUpdated: 0, gatesUpdated: 0, errors: [String(err)] };
      }
    },
  );
}

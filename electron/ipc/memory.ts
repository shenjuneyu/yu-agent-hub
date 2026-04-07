import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { IpcChannels } from '../types';
import { database } from '../services/database';
import { logger } from '../utils/logger';

export function registerMemoryHandlers(): void {
  ipcMain.handle(IpcChannels.MEMORY_LIST, (_event, agentId: string, projectId?: string | null) => {
    try {
      return database.prepare(
        `SELECT id, agent_id as agentId, project_id as projectId, key, value, created_at as createdAt, updated_at as updatedAt
         FROM agent_memory WHERE agent_id = ? AND (project_id = ? OR project_id IS NULL)
         ORDER BY updated_at DESC`,
        [agentId, projectId || null],
      );
    } catch (err) {
      logger.error('Failed to list agent memory', err);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.MEMORY_SAVE, (_event, params: {
    agentId: string;
    projectId?: string | null;
    key: string;
    value: string;
  }) => {
    try {
      const now = new Date().toISOString();
      const existing = database.prepare(
        `SELECT id FROM agent_memory WHERE agent_id = ? AND key = ? AND (project_id = ? OR (project_id IS NULL AND ? IS NULL))`,
        [params.agentId, params.key, params.projectId || null, params.projectId || null],
      );

      if (existing.length > 0) {
        database.run(
          `UPDATE agent_memory SET value = ?, updated_at = ? WHERE id = ?`,
          [params.value, now, (existing[0] as any).id],
        );
        return { id: (existing[0] as any).id, updated: true };
      }

      const id = randomUUID();
      database.run(
        `INSERT INTO agent_memory (id, agent_id, project_id, key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, params.agentId, params.projectId || null, params.key, params.value, now, now],
      );
      return { id, updated: false };
    } catch (err) {
      logger.error('Failed to save agent memory', err);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.MEMORY_DELETE, (_event, params: {
    agentId: string;
    key: string;
    projectId?: string | null;
  }) => {
    try {
      database.run(
        `DELETE FROM agent_memory WHERE agent_id = ? AND key = ? AND (project_id = ? OR (project_id IS NULL AND ? IS NULL))`,
        [params.agentId, params.key, params.projectId || null, params.projectId || null],
      );
      return { success: true };
    } catch (err) {
      logger.error('Failed to delete agent memory', err);
      throw err;
    }
  });
}

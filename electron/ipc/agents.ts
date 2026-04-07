import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { agentLoader } from '../services/agent-loader';
import { database } from '../services/database';
import { logger } from '../utils/logger';
import type { AgentFilters } from '../types';

export function registerAgentHandlers(): void {
  // List agents (with optional filters)
  ipcMain.handle(IpcChannels.AGENT_LIST, (_e, filters?: AgentFilters) => {
    try {
      if (filters) {
        return agentLoader.getFiltered(filters);
      }
      return agentLoader.getAll();
    } catch (err) {
      logger.error('Failed to list agents', err);
      throw err;
    }
  });

  // Get single agent by ID
  ipcMain.handle(IpcChannels.AGENT_GET, (_e, id: string) => {
    try {
      const agent = agentLoader.getById(id);
      if (!agent) {
        throw new Error(`Agent not found: ${id}`);
      }
      const stats = database.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(cost_usd), 0) as cost,
                COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
         FROM claude_sessions WHERE agent_id = ?`,
        [id],
      );
      const s = (stats as any[])[0] || {};

      const memories = database.prepare(
        `SELECT key, value, updated_at as updatedAt FROM agent_memory WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 20`,
        [id],
      );

      const recentSessions = database.prepare(
        `SELECT id, task, status, cost_usd as costUsd, input_tokens + output_tokens as totalTokens,
                started_at as startedAt, duration_ms as durationMs
         FROM claude_sessions WHERE agent_id = ? ORDER BY started_at DESC LIMIT 5`,
        [id],
      );

      return {
        ...agent,
        systemPrompt: agentLoader.getSystemPrompt(id),
        sessionCount: s.cnt || 0,
        totalCost: s.cost || 0,
        totalTokens: s.tokens || 0,
        memories: memories || [],
        recentSessions: recentSessions || [],
      };
    } catch (err) {
      logger.error('Failed to get agent', err);
      throw err;
    }
  });

  // Get departments
  ipcMain.handle(IpcChannels.AGENT_GET_DEPARTMENTS, () => {
    try {
      return agentLoader.getDepartments();
    } catch (err) {
      logger.error('Failed to get departments', err);
      throw err;
    }
  });
}

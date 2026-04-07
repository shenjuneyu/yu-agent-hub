import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { sessionManager } from '../services/session-manager';
import { promptAssembler } from '../services/prompt-assembler';
import { database } from '../services/database';
import { logger } from '../utils/logger';
import type { SpawnParams, StopParams, PtyInputData, PtyResizeData, AssignTaskParams, SendDelegationParams } from '../types';

export function registerSessionHandlers(): void {
  // Spawn a new session
  ipcMain.handle(IpcChannels.SESSION_SPAWN, (_e, params: SpawnParams) => {
    try {
      return sessionManager.spawn(params);
    } catch (err) {
      logger.error('Failed to spawn session', err);
      throw err;
    }
  });

  // Stop a session (supports force param)
  ipcMain.handle(IpcChannels.SESSION_STOP, (_e, params: StopParams) => {
    try {
      sessionManager.stop(params.sessionId, params.force);
      return { success: true };
    } catch (err) {
      logger.error('Failed to stop session', err);
      throw err;
    }
  });

  // List sessions (from DB)
  ipcMain.handle(IpcChannels.SESSION_LIST, (_e, limit?: number) => {
    try {
      return sessionManager.listFromDb({ limit });
    } catch (err) {
      logger.error('Failed to list sessions', err);
      throw err;
    }
  });

  // List sessions by task
  ipcMain.handle(IpcChannels.SESSION_LIST_BY_TASK, (_e, taskId: string) => {
    try {
      return sessionManager.listFromDb({ taskId });
    } catch (err) {
      logger.error('Failed to list sessions by task', err);
      throw err;
    }
  });

  // List sessions by project
  ipcMain.handle(IpcChannels.SESSION_LIST_BY_PROJECT, (_e, projectId: string) => {
    try {
      return sessionManager.listFromDb({ projectId });
    } catch (err) {
      logger.error('Failed to list sessions by project', err);
      throw err;
    }
  });

  // Get output buffer for terminal replay
  ipcMain.handle(IpcChannels.SESSION_GET_OUTPUT_BUFFER, (_e, ptyId: string) => {
    try {
      return sessionManager.getOutputBuffer(ptyId);
    } catch (err) {
      logger.error('Failed to get output buffer', err);
      return '';
    }
  });

  // Get session log from disk
  ipcMain.handle(IpcChannels.SESSION_GET_LOG, (_e, sessionId: string) => {
    try {
      return sessionManager.getSessionLog(sessionId);
    } catch (err) {
      logger.error('Failed to get session log', err);
      return '';
    }
  });

  // Get active sessions
  ipcMain.handle(IpcChannels.SESSION_GET_ACTIVE, () => {
    try {
      return sessionManager.getActiveSessions();
    } catch (err) {
      logger.error('Failed to get active sessions', err);
      throw err;
    }
  });

  // Preview assembled prompt
  ipcMain.handle(IpcChannels.SESSION_PREVIEW_PROMPT, (_e, agentId: string, projectId?: string) => {
    try {
      return promptAssembler.preview(agentId, projectId);
    } catch (err) {
      logger.error('Failed to preview prompt', err);
      throw err;
    }
  });

  // Assign task to active session
  ipcMain.handle(IpcChannels.SESSION_ASSIGN_TASK, (_e, params: AssignTaskParams) => {
    try {
      sessionManager.assignTask(params.sessionId, params.taskId, params.taskTitle, params.taskDescription);
      return { success: true };
    } catch (err) {
      logger.error('Failed to assign task to session', err);
      throw err;
    }
  });

  // Send delegation between sessions
  ipcMain.handle(IpcChannels.SESSION_SEND_DELEGATION, (_e, params: SendDelegationParams) => {
    try {
      return sessionManager.sendDelegation(params);
    } catch (err) {
      logger.error('Failed to send delegation', err);
      throw err;
    }
  });

  // List active delegations
  ipcMain.handle(IpcChannels.SESSION_LIST_DELEGATIONS, () => {
    return sessionManager.listDelegations();
  });

  ipcMain.handle(IpcChannels.SESSION_REQUEST_SUMMARY, (_e, sessionId: string) => {
    return sessionManager.triggerSummary(sessionId);
  });

  ipcMain.handle(IpcChannels.SESSION_GET_SUMMARIES, (_e, sessionId: string) => {
    return sessionManager.getSessionSummaries(sessionId);
  });

  // Scan resumable sessions from Claude Code conversation files
  ipcMain.handle(IpcChannels.SESSION_SCAN_RESUMABLE, (_e, limit?: number) => {
    try {
      return sessionManager.scanResumableSessions(limit);
    } catch (err) {
      logger.error('Failed to scan resumable sessions', err);
      throw err;
    }
  });

  // Cost & usage statistics aggregation
  ipcMain.handle(IpcChannels.SESSION_COST_STATS, (_e, filters?: { projectId?: string; days?: number }) => {
    try {
      const days = filters?.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const projectFilter = filters?.projectId ? ' AND project_id = ?' : '';
      const params: unknown[] = [since];
      if (filters?.projectId) params.push(filters.projectId);

      // Overall totals
      const totals = database.prepare(
        `SELECT COUNT(*) as sessions, COALESCE(SUM(cost_usd), 0) as totalCost,
                COALESCE(SUM(input_tokens), 0) as inputTokens, COALESCE(SUM(output_tokens), 0) as outputTokens,
                COALESCE(SUM(tool_calls_count), 0) as toolCalls
         FROM claude_sessions WHERE started_at >= ?${projectFilter}`,
        params,
      );

      // Per-agent breakdown
      const byAgent = database.prepare(
        `SELECT agent_id as agentId, COUNT(*) as sessions, COALESCE(SUM(cost_usd), 0) as totalCost,
                COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens
         FROM claude_sessions WHERE started_at >= ?${projectFilter}
         GROUP BY agent_id ORDER BY totalCost DESC LIMIT 20`,
        params,
      );

      // Per-project breakdown (only when no project filter)
      let byProject: unknown[] = [];
      if (!filters?.projectId) {
        byProject = database.prepare(
          `SELECT cs.project_id as projectId, p.name as projectName, COUNT(*) as sessions,
                  COALESCE(SUM(cs.cost_usd), 0) as totalCost,
                  COALESCE(SUM(cs.input_tokens + cs.output_tokens), 0) as totalTokens
           FROM claude_sessions cs LEFT JOIN projects p ON cs.project_id = p.id
           WHERE cs.started_at >= ? AND cs.project_id IS NOT NULL
           GROUP BY cs.project_id ORDER BY totalCost DESC`,
          [since],
        );
      }

      // Daily cost trend
      const daily = database.prepare(
        `SELECT DATE(started_at) as day, COALESCE(SUM(cost_usd), 0) as cost,
                COUNT(*) as sessions
         FROM claude_sessions WHERE started_at >= ?${projectFilter}
         GROUP BY DATE(started_at) ORDER BY day ASC`,
        params,
      );

      const t = (totals as any[])[0] || {};
      return {
        totals: {
          sessions: t.sessions || 0,
          totalCost: t.totalCost || 0,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          toolCalls: t.toolCalls || 0,
        },
        byAgent,
        byProject,
        daily,
      };
    } catch (err) {
      logger.error('Failed to get cost stats', err);
      throw err;
    }
  });

  // PTY input
  ipcMain.on(IpcChannels.PTY_INPUT, (_e, data: PtyInputData) => {
    try {
      sessionManager.writeInput(data.ptyId, data.data);
    } catch (err) {
      logger.warn('Failed to write PTY input', err);
    }
  });

  // PTY resize
  ipcMain.on(IpcChannels.PTY_RESIZE, (_e, data: PtyResizeData) => {
    try {
      sessionManager.resizePty(data.ptyId, data.cols, data.rows);
    } catch (err) {
      logger.warn('Failed to resize PTY', err);
    }
  });
}

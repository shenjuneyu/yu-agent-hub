/**
 * IPC handlers for new features: GroupChat, Sprint Generator, Browser Verify, MCP.
 */
import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { groupChatManager } from '../services/group-chat';
import { sprintGenerator } from '../services/sprint-generator';
import { browserVerify } from '../services/browser-verify';
import { mcpServer } from '../services/mcp-server';
import { logger } from '../utils/logger';

export function registerFeatureHandlers(): void {
  // ─── Group Chat ─────────────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.GROUP_CHAT_START, (_e, config: {
    topic: string;
    agentIds: string[];
    projectId?: string | null;
    maxRounds?: number;
    selectionMode?: 'round-robin' | 'auto';
  }) => {
    try {
      return groupChatManager.start(config);
    } catch (err) {
      logger.error('Failed to start group chat', err);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.GROUP_CHAT_GET, (_e, sessionId: string) => {
    return groupChatManager.getSession(sessionId);
  });

  ipcMain.handle(IpcChannels.GROUP_CHAT_LIST, () => {
    return groupChatManager.listActive();
  });

  ipcMain.handle(IpcChannels.GROUP_CHAT_CANCEL, (_e, sessionId: string) => {
    groupChatManager.cancel(sessionId);
    return { success: true };
  });

  // ─── Sprint Generator ──────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.SPRINT_GENERATE, (_e, params: {
    projectId: string;
    brief: string;
    sprintName?: string;
    priority?: 'normal' | 'urgent';
  }) => {
    try {
      return sprintGenerator.generate(params);
    } catch (err) {
      logger.error('Failed to generate sprint', err);
      throw err;
    }
  });

  // ─── Browser Verify ────────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.BROWSER_AVAILABLE, () => {
    return browserVerify.isAvailable();
  });

  ipcMain.handle(IpcChannels.BROWSER_SCREENSHOT, async (_e, params: {
    url: string;
    width?: number;
    height?: number;
    waitFor?: number;
    fullPage?: boolean;
    sessionId?: string;
  }) => {
    try {
      return await browserVerify.screenshot(params.url, params);
    } catch (err) {
      logger.error('Failed to take screenshot', err);
      throw err;
    }
  });

  // ─── MCP Server ────────────────────────────────────────────────────────
  ipcMain.handle(IpcChannels.MCP_GET_TOOLS, () => {
    return mcpServer.getTools();
  });

  ipcMain.handle(IpcChannels.MCP_CALL_TOOL, (_e, toolName: string, args: Record<string, unknown>) => {
    try {
      return mcpServer.handleToolCall(toolName, args);
    } catch (err) {
      logger.error(`MCP tool call failed: ${toolName}`, err);
      throw err;
    }
  });
}

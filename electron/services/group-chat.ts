/**
 * GroupChat — Multi-agent discussion mode.
 * Inspired by AutoGen's GroupChat pattern.
 *
 * Multiple agents discuss a topic in rounds. A selector determines
 * who speaks next based on the conversation context.
 *
 * Usage: Start a group chat with a topic and list of agent IDs.
 * Each round, the next speaker is selected and given the full
 * conversation history. The discussion continues until maxRounds
 * or a consensus is reached.
 */

import { randomUUID } from 'crypto';
import { database } from './database';
import { messageBroker } from './message-broker';
import { eventBus } from './event-bus';
import { logger } from '../utils/logger';

export interface GroupChatConfig {
  topic: string;
  agentIds: string[];
  projectId?: string | null;
  maxRounds?: number;
  selectionMode?: 'round-robin' | 'auto';
}

export interface GroupChatMessage {
  agentId: string;
  content: string;
  round: number;
  timestamp: string;
}

export interface GroupChatSession {
  id: string;
  topic: string;
  agentIds: string[];
  projectId: string | null;
  maxRounds: number;
  currentRound: number;
  messages: GroupChatMessage[];
  status: 'active' | 'completed' | 'cancelled';
  selectionMode: 'round-robin' | 'auto';
  createdAt: string;
}

class GroupChatManager {
  private activeSessions = new Map<string, GroupChatSession>();

  /**
   * Start a new group chat session.
   * Creates the session and sends the topic to the first agent.
   */
  start(config: GroupChatConfig): GroupChatSession {
    const session: GroupChatSession = {
      id: randomUUID(),
      topic: config.topic,
      agentIds: config.agentIds,
      projectId: config.projectId || null,
      maxRounds: config.maxRounds || 3,
      currentRound: 0,
      messages: [],
      status: 'active',
      selectionMode: config.selectionMode || 'round-robin',
      createdAt: new Date().toISOString(),
    };

    this.activeSessions.set(session.id, session);

    // Persist to DB
    try {
      database.run(
        `INSERT INTO group_chats (id, topic, agent_ids, project_id, max_rounds, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [session.id, session.topic, JSON.stringify(session.agentIds), session.projectId, session.maxRounds, 'active', session.createdAt],
      );
    } catch {
      // Table may not exist yet if migration hasn't run — continue in-memory only
      logger.warn('group_chats table not found, running in-memory only');
    }

    logger.info(`GroupChat ${session.id} started: "${config.topic}" with ${config.agentIds.join(', ')}`);

    // Send topic to first agent
    this.sendToNextAgent(session);

    return session;
  }

  /**
   * Record a response from an agent and advance to the next speaker.
   */
  addResponse(sessionId: string, agentId: string, content: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    session.messages.push({
      agentId,
      content,
      round: session.currentRound,
      timestamp: new Date().toISOString(),
    });

    // Check if all agents have spoken this round
    const spokThisRound = new Set(
      session.messages.filter((m) => m.round === session.currentRound).map((m) => m.agentId),
    );

    if (spokThisRound.size >= session.agentIds.length) {
      session.currentRound++;
      if (session.currentRound >= session.maxRounds) {
        this.complete(sessionId);
        return;
      }
    }

    this.sendToNextAgent(session);
  }

  /**
   * Get the conversation history formatted for the next agent.
   */
  private buildContext(session: GroupChatSession): string {
    const lines = [
      `## 團隊討論：${session.topic}`,
      `第 ${session.currentRound + 1}/${session.maxRounds} 輪`,
      '',
      '### 討論紀錄',
      '',
    ];

    for (const msg of session.messages) {
      lines.push(`**${msg.agentId}** (第 ${msg.round + 1} 輪):`);
      lines.push(msg.content);
      lines.push('');
    }

    lines.push('---');
    lines.push('請基於以上討論內容，提出你的觀點或建議。如果同意前面的結論，請明確表示並補充細節。');

    return lines.join('\n');
  }

  /**
   * Determine and notify the next speaker.
   */
  private sendToNextAgent(session: GroupChatSession): void {
    const spokThisRound = new Set(
      session.messages.filter((m) => m.round === session.currentRound).map((m) => m.agentId),
    );

    // Find next agent who hasn't spoken this round
    const nextAgent = session.agentIds.find((id) => !spokThisRound.has(id));
    if (!nextAgent) return;

    const context = session.messages.length === 0
      ? `## 團隊討論\n\n主題：${session.topic}\n\n你是第一位發言者，請提出你的觀點和建議。\n\n參與者：${session.agentIds.join(', ')}\n共 ${session.maxRounds} 輪討論。`
      : this.buildContext(session);

    // Send via MessageBroker
    messageBroker.send({
      fromAgent: 'group-chat',
      toAgent: nextAgent,
      content: context,
      projectId: session.projectId,
    });

    logger.info(`GroupChat ${session.id}: sent to ${nextAgent} (round ${session.currentRound + 1})`);
  }

  complete(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.status = 'completed';
    logger.info(`GroupChat ${sessionId} completed after ${session.currentRound} rounds, ${session.messages.length} messages`);

    eventBus.emit('group-chat:completed', {
      sessionId,
      topic: session.topic,
      messageCount: session.messages.length,
      rounds: session.currentRound,
    });

    try {
      database.run(`UPDATE group_chats SET status = 'completed' WHERE id = ?`, [sessionId]);
    } catch { /* ignore */ }
  }

  cancel(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    session.status = 'cancelled';
    this.activeSessions.delete(sessionId);
    try {
      database.run(`UPDATE group_chats SET status = 'cancelled' WHERE id = ?`, [sessionId]);
    } catch { /* ignore */ }
  }

  getSession(sessionId: string): GroupChatSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  listActive(): GroupChatSession[] {
    return [...this.activeSessions.values()].filter((s) => s.status === 'active');
  }
}

export const groupChatManager = new GroupChatManager();

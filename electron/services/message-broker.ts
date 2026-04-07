/**
 * MessageBroker — Cross-session bi-directional messaging between agents.
 *
 * Core responsibilities:
 *   1. Persist messages to SQLite (messages table)
 *   2. Route messages to target agent's active session (PTY injection)
 *   3. Auto-spawn a session if target agent has no active session
 *   4. Queue messages when target session is busy, deliver on idle
 *   5. Emit events so the UI can display messages in real-time
 *
 * Anti-loop: rate-limited auto-spawn (max 3 per agent per minute).
 */

import { randomUUID } from 'crypto';
import { database } from './database';
import { eventBus } from './event-bus';
import { logger } from '../utils/logger';
import { ptyWriteAndSubmit } from './pty-manager';
import type { MessageRecord, SendMessageParams, MessageFilters, MessageStatus } from '../types';

/** Minimal session view needed by the broker (avoids circular dep with SessionManager). */
export interface BrokerSessionView {
  sessionId: string;
  agentId: string;
  status: string;
  interactive: boolean;
  ptyProcess: { write: (data: string) => void };
  pendingMessages: string[];
  projectId: string | null;
}

/** Callback interface — SessionManager registers these at init time. */
export interface BrokerCallbacks {
  findActiveSessionByAgent: (agentId: string, projectId?: string | null) => BrokerSessionView | undefined;
  spawnSession: (agentId: string, task: string, projectId?: string | null) => string; // returns sessionId
  getSession: (sessionId: string) => BrokerSessionView | undefined;
}

// Auto-spawn rate limit
const SPAWN_COOLDOWN_MS = 60_000; // 1 minute window
const MAX_SPAWNS_PER_WINDOW = 3;

class MessageBroker {
  private callbacks: BrokerCallbacks | null = null;
  private spawnHistory: Map<string, number[]> = new Map(); // agentId → timestamps

  /**
   * Register callbacks from SessionManager (called once at startup).
   * This breaks the circular dependency: MessageBroker doesn't import SessionManager.
   */
  registerCallbacks(cb: BrokerCallbacks): void {
    this.callbacks = cb;
    logger.info('MessageBroker: callbacks registered');
  }

  // ─── Send ──────────────────────────────────────────────────────────────────

  /**
   * Send a message from one agent to another.
   * Persists to DB, then attempts immediate delivery.
   */
  send(params: SendMessageParams): MessageRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Persist
    database.run(
      `INSERT INTO messages (id, from_agent, to_agent, content, status, project_id, reply_to, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, params.fromAgent, params.toAgent, params.content, params.projectId || null, params.replyTo || null, now],
    );

    const message: MessageRecord = {
      id,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      content: params.content,
      status: 'pending',
      projectId: params.projectId || null,
      sessionId: null,
      replyTo: params.replyTo || null,
      createdAt: now,
      deliveredAt: null,
      readAt: null,
    };

    logger.info(`Message ${id}: ${params.fromAgent} → ${params.toAgent} (${params.content.slice(0, 60)}...)`);

    // Emit for UI
    eventBus.emit('message:created', message);

    // Attempt delivery
    this.tryDeliver(message);

    return message;
  }

  // ─── Delivery ──────────────────────────────────────────────────────────────

  /**
   * Try to deliver a message to the target agent's active session.
   */
  private tryDeliver(message: MessageRecord): void {
    if (!this.callbacks) {
      logger.warn('MessageBroker: no callbacks registered, cannot deliver');
      return;
    }

    // Find target agent's active session
    let session = this.callbacks.findActiveSessionByAgent(message.toAgent, message.projectId);

    if (!session) {
      // Auto-spawn if allowed by rate limit
      if (this.canAutoSpawn(message.toAgent)) {
        logger.info(`MessageBroker: auto-spawning session for ${message.toAgent}`);
        try {
          const summary = `收到來自 ${message.fromAgent} 的訊息，請查看並回覆。`;
          const sessionId = this.callbacks.spawnSession(message.toAgent, summary, message.projectId);
          this.recordSpawn(message.toAgent);

          // Queue message for delivery after session starts
          const targetSession = this.callbacks.getSession(sessionId);
          if (targetSession) {
            const formatted = this.formatMessageForPty(message);
            targetSession.pendingMessages.push(formatted);
            this.markDelivered(message.id, sessionId);
            logger.info(`Message ${message.id}: queued for auto-spawned session ${sessionId}`);
          }
          return;
        } catch (err) {
          logger.warn(`MessageBroker: auto-spawn failed for ${message.toAgent}`, err);
          return; // Message stays pending, will be retried on next deliverPending call
        }
      } else {
        logger.info(`Message ${message.id}: no active session for ${message.toAgent}, rate limit reached — stays pending`);
        return;
      }
    }

    // Session exists — deliver or queue
    const formatted = this.formatMessageForPty(message);
    const isIdle = session.interactive && ['running', 'waiting_input'].includes(session.status);

    if (isIdle) {
      ptyWriteAndSubmit(session.ptyProcess as any, formatted);
      this.markDelivered(message.id, session.sessionId);
      logger.info(`Message ${message.id}: delivered to ${message.toAgent} (session ${session.sessionId})`);
    } else {
      session.pendingMessages.push(formatted);
      this.markDelivered(message.id, session.sessionId);
      logger.info(`Message ${message.id}: queued in session ${session.sessionId} (busy)`);
    }
  }

  /**
   * Deliver all pending messages for a specific agent.
   * Called by SessionManager when a session becomes idle.
   */
  deliverPending(agentId: string, projectId?: string | null): void {
    const pending = this.listByFilters({ toAgent: agentId, status: 'pending', limit: 10 });
    for (const msg of pending) {
      // If projectId filter is set, only deliver same-project messages
      if (projectId && msg.projectId && msg.projectId !== projectId) continue;
      this.tryDeliver(msg);
    }
  }

  // ─── Format ────────────────────────────────────────────────────────────────

  private formatMessageForPty(message: MessageRecord): string {
    const lines = [
      '',
      `--- [來自 ${message.fromAgent} 的訊息] ---`,
      '',
      message.content,
      '',
      `（訊息 ID: ${message.id}）`,
      `若需回覆，請使用: SendMessage(to: '${message.fromAgent}', content: '你的回覆')`,
      '',
    ];
    return lines.join('\n');
  }

  // ─── Status updates ────────────────────────────────────────────────────────

  private markDelivered(messageId: string, sessionId: string): void {
    const now = new Date().toISOString();
    database.run(
      `UPDATE messages SET status = 'delivered', session_id = ?, delivered_at = ? WHERE id = ?`,
      [sessionId, now, messageId],
    );
    eventBus.emit('message:delivered', { messageId, sessionId });
  }

  markRead(messageId: string): void {
    const now = new Date().toISOString();
    database.run(
      `UPDATE messages SET status = 'read', read_at = ? WHERE id = ?`,
      [now, messageId],
    );
    eventBus.emit('message:read', { messageId });
  }

  // ─── Rate limiting ─────────────────────────────────────────────────────────

  private canAutoSpawn(agentId: string): boolean {
    const now = Date.now();
    const history = this.spawnHistory.get(agentId) || [];
    // Prune old entries
    const recent = history.filter((ts) => now - ts < SPAWN_COOLDOWN_MS);
    this.spawnHistory.set(agentId, recent);
    return recent.length < MAX_SPAWNS_PER_WINDOW;
  }

  private recordSpawn(agentId: string): void {
    const history = this.spawnHistory.get(agentId) || [];
    history.push(Date.now());
    this.spawnHistory.set(agentId, history);
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  getById(id: string): MessageRecord | null {
    const rows = database.prepare('SELECT * FROM messages WHERE id = ?', [id]);
    return rows.length > 0 ? this.rowToMessage(rows[0]) : null;
  }

  listByFilters(filters: MessageFilters): MessageRecord[] {
    let sql = 'SELECT * FROM messages WHERE 1=1';
    const params: unknown[] = [];

    if (filters.agent) {
      sql += ' AND (from_agent = ? OR to_agent = ?)';
      params.push(filters.agent, filters.agent);
    }
    if (filters.toAgent) {
      sql += ' AND to_agent = ?';
      params.push(filters.toAgent);
    }
    if (filters.fromAgent) {
      sql += ' AND from_agent = ?';
      params.push(filters.fromAgent);
    }
    if (filters.projectId) {
      sql += ' AND project_id = ?';
      params.push(filters.projectId);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    } else {
      sql += ' LIMIT 50';
    }

    const rows = database.prepare(sql, params);
    return rows.map((r: any) => this.rowToMessage(r));
  }

  /**
   * Get unread count for an agent.
   */
  getUnreadCount(agentId: string, projectId?: string | null): number {
    let sql = `SELECT COUNT(*) as cnt FROM messages WHERE to_agent = ? AND status IN ('pending', 'delivered')`;
    const params: unknown[] = [agentId];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    const rows = database.prepare(sql, params);
    return (rows[0] as any)?.cnt || 0;
  }

  // ─── Row mapping ──────────────────────────────────────────────────────────

  private rowToMessage(row: any): MessageRecord {
    return {
      id: row.id,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      content: row.content,
      status: row.status as MessageStatus,
      projectId: row.project_id || null,
      sessionId: row.session_id || null,
      replyTo: row.reply_to || null,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at || null,
      readAt: row.read_at || null,
    };
  }
}

export const messageBroker = new MessageBroker();

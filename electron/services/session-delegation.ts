/**
 * Delegation tracking and report delivery for SessionManager.
 * Encapsulates the delegations Map and all delegation-related logic so the
 * main SessionManager class stays focused on session lifecycle management.
 */
import { randomUUID } from 'crypto';
import { database } from './database';
import { eventBus } from './event-bus';
import { messageBroker } from './message-broker';
import { logger } from '../utils/logger';
import { stripTerminalOutput, ptyWriteAndSubmit } from './pty-manager';
import type { DelegationRequest, SendDelegationParams } from '../types';

// Minimal shape of a session needed by the delegation system.
export interface DelegationSessionView {
  agentId: string;
  agentName?: string;
  status: string;
  interactive: boolean;
  outputBuffer: string;
  pendingMessages: string[];
  ptyProcess: { write: (data: string) => void };
}

export class DelegationManager {
  private readonly delegations = new Map<string, DelegationRequest>();

  /**
   * Create and queue/send a delegation to a target session.
   */
  send(
    params: SendDelegationParams,
    source: DelegationSessionView,
    target: DelegationSessionView,
  ): DelegationRequest {
    const delegation: DelegationRequest = {
      id: randomUUID(),
      sourceSessionId: params.sourceSessionId,
      targetSessionId: params.targetSessionId,
      instruction: params.instruction,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };

    this.delegations.set(delegation.id, delegation);

    const sourceLabel = source.agentName || source.agentId;
    const message = [
      '',
      `--- [來自 ${sourceLabel} 的指派] ---`,
      '',
      params.instruction,
      '',
      '完成後請整理一份簡要報告說明你做了什麼。',
      '',
    ].join('\n');

    if (target.interactive && target.status !== 'waiting_input') {
      target.pendingMessages.push(message);
      logger.info(
        `Delegation ${delegation.id}: ${source.agentId} → ${target.agentId} (queued, target busy) "${params.instruction.slice(0, 50)}"`,
      );
    } else {
      ptyWriteAndSubmit(target.ptyProcess as any, message);
      logger.info(
        `Delegation ${delegation.id}: ${source.agentId} → ${target.agentId} "${params.instruction.slice(0, 50)}"`,
      );
    }

    // Persist delegation as a message for cross-session history
    try {
      messageBroker.send({
        fromAgent: source.agentId,
        toAgent: target.agentId,
        content: `[委派] ${params.instruction}`,
      });
    } catch (err) {
      logger.warn('Delegation: failed to persist via MessageBroker (non-fatal)', err);
    }

    return delegation;
  }

  list(): DelegationRequest[] {
    return Array.from(this.delegations.values());
  }

  /**
   * Deliver pending delegation reports when a target session completes (exits).
   */
  deliverOnComplete(
    completedSessionId: string,
    getSession: (id: string) => DelegationSessionView | undefined,
  ): void {
    for (const [id, delegation] of this.delegations) {
      if (delegation.targetSessionId !== completedSessionId) continue;
      if (delegation.status === 'completed') continue;

      // Try to get report from DB result_summary
      let report = '';
      try {
        const rows = database.prepare(
          'SELECT result_summary FROM claude_sessions WHERE id = ?',
          [completedSessionId],
        );
        report = rows[0]?.result_summary || '';
      } catch { /* ignore */ }

      // Fallback: extract from output buffer
      if (!report) {
        const target = getSession(completedSessionId);
        if (target?.outputBuffer) {
          report = stripTerminalOutput(target.outputBuffer.slice(-2000)).slice(-500) || '(無摘要)';
        }
      }

      this.dispatchReport(id, delegation, completedSessionId, report, getSession);
    }
  }

  /**
   * Deliver pending delegation reports when a target session returns to idle (interactive mode).
   */
  deliverOnIdle(
    sessionId: string,
    getSession: (id: string) => DelegationSessionView | undefined,
  ): void {
    for (const [id, delegation] of this.delegations) {
      if (delegation.targetSessionId !== sessionId) continue;
      if (delegation.status === 'completed') continue;

      const target = getSession(sessionId);
      if (!target) continue;

      const report = stripTerminalOutput(target.outputBuffer.slice(-3000)).slice(-800) || '(無摘要)';
      this.dispatchReport(id, delegation, sessionId, report, getSession);
    }
  }

  private dispatchReport(
    id: string,
    delegation: DelegationRequest,
    targetSessionId: string,
    report: string,
    getSession: (id: string) => DelegationSessionView | undefined,
  ): void {
    delegation.report = report;
    delegation.status = 'completed';

    const source = getSession(delegation.sourceSessionId);
    if (source && !['completed', 'failed', 'stopped'].includes(source.status)) {
      const target = getSession(targetSessionId);
      const label = target?.agentName || target?.agentId || targetSessionId.slice(0, 8);
      const msg = [
        '',
        `--- [${label} 執行報告] ---`,
        '',
        report,
        '',
        '--- [報告結束] ---',
        '以上是指派任務的執行結果，請根據此結果繼續。',
        '',
      ].join('\n');
      ptyWriteAndSubmit(source.ptyProcess as any, msg);
      logger.info(`Delegation ${id}: report delivered back to ${source.agentId}`);
    }

    eventBus.emit('delegation:report', {
      delegationId: id,
      sourceSessionId: delegation.sourceSessionId,
      targetSessionId,
      report,
    });

    // Persist report as a message for cross-session history
    const target = getSession(targetSessionId);
    const sourceSession = getSession(delegation.sourceSessionId);
    if (target && sourceSession) {
      try {
        messageBroker.send({
          fromAgent: target.agentId,
          toAgent: sourceSession.agentId,
          content: `[執行報告] ${report.slice(0, 500)}`,
        });
      } catch (err) {
        logger.warn('Delegation report: failed to persist via MessageBroker (non-fatal)', err);
      }
    }
  }
}

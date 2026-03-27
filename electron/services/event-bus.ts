import { EventEmitter } from 'events';
import type { SessionEvent, SessionStatus, PtyData } from '../types';

export interface FileSyncedData {
  projectId: string;
  type: 'task' | 'gate' | 'full';
  filePath?: string;
}

export interface SessionStatusChange {
  sessionId: string;
  status: SessionStatus;
  agentId: string;
  error?: string;
}

/**
 * Application-wide event bus for decoupling services.
 * Singleton pattern — import and use directly.
 *
 * Events:
 *   'session:event'   → SessionEvent
 *   'session:status'  → SessionStatusChange
 *   'pty:data'        → PtyData
 */
class MaestroEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitSessionEvent(event: SessionEvent): void {
    this.emit('session:event', event);
  }

  onSessionEvent(handler: (event: SessionEvent) => void): void {
    this.on('session:event', handler);
  }

  emitSessionStatus(change: SessionStatusChange): void {
    this.emit('session:status', change);
  }

  onSessionStatus(handler: (change: SessionStatusChange) => void): void {
    this.on('session:status', handler);
  }

  emitPtyData(data: PtyData): void {
    this.emit('pty:data', data);
  }

  onPtyData(handler: (data: PtyData) => void): void {
    this.on('pty:data', handler);
  }

  emitFileSynced(data: FileSyncedData): void {
    this.emit('project:file-synced', data);
  }

  onFileSynced(handler: (data: FileSyncedData) => void): void {
    this.on('project:file-synced', handler);
  }

  /**
   * Remove all listeners for a specific session (cleanup on session end).
   */
  cleanupSession(sessionId: string): void {
    // Event bus uses global events, not per-session.
    // This is a hook for future per-session listener patterns.
    // For now, just ensure we don't exceed max listeners.
    if (this.listenerCount('session:event') > 40) {
      this.removeAllListeners('session:event');
    }
    if (this.listenerCount('session:status') > 40) {
      this.removeAllListeners('session:status');
    }
    if (this.listenerCount('pty:data') > 40) {
      this.removeAllListeners('pty:data');
    }
  }
}

export const eventBus = new MaestroEventBus();

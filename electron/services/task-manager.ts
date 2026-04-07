import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { database } from './database';
import { eventBus } from './event-bus';
import { projectSync } from './project-sync';
import { logger } from '../utils/logger';
import type {
  TaskRecord,
  TaskStatus,
  TaskCreateParams,
  TaskUpdateParams,
  TaskTransitionParams,
  TaskFilters,
} from '../types';

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  created: ['assigned', 'in_progress', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['in_review', 'done', 'blocked'],
  in_review: ['done', 'rejected'],
  blocked: ['in_progress'],
  rejected: ['assigned'],
  done: [],
};

class TaskManager {
  create(params: TaskCreateParams): TaskRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    database.run(
      `INSERT INTO tasks (id, project_id, sprint_id, parent_task_id, title, description,
        assigned_to, created_by, priority, tags, estimated_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.projectId,
        params.sprintId || null,
        params.parentTaskId || null,
        params.title,
        params.description || '',
        params.assignedTo || null,
        params.createdBy || null,
        params.priority || 'medium',
        params.tags || null,
        params.estimatedHours || null,
        now,
        now,
      ],
    );

    logger.info(`Task created: ${id} - ${params.title}`);
    const task = this.getById(params.projectId, id)!;

    // Generate task record file
    this.generateTaskRecord(task);

    return task;
  }

  /**
   * Get a task by composite key (projectId + id).
   * Falls back to id-only lookup for UUID-based tasks (backward compat).
   */
  getById(projectId: string, id: string): TaskRecord | null;
  getById(id: string): TaskRecord | null;
  getById(projectIdOrId: string, maybeId?: string): TaskRecord | null {
    let rows: any[];
    if (maybeId !== undefined) {
      // Composite key lookup
      rows = database.prepare(
        'SELECT t.*, s.name as sprint_name FROM tasks t LEFT JOIN sprints s ON t.sprint_id = s.id WHERE t.project_id = ? AND t.id = ?',
        [projectIdOrId, maybeId],
      );
    } else {
      // Legacy: single id lookup (works for UUID-based tasks)
      rows = database.prepare(
        'SELECT t.*, s.name as sprint_name FROM tasks t LEFT JOIN sprints s ON t.sprint_id = s.id WHERE t.id = ?',
        [projectIdOrId],
      );
    }
    if (rows.length === 0) return null;
    return this.rowToTask(rows[0]);
  }

  list(filters?: TaskFilters): TaskRecord[] {
    let sql = 'SELECT t.*, s.name as sprint_name FROM tasks t LEFT JOIN sprints s ON t.sprint_id = s.id WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.projectId) {
      sql += ' AND t.project_id = ?';
      params.push(filters.projectId);
    }
    if (filters?.sprintId) {
      sql += ' AND t.sprint_id = ?';
      params.push(filters.sprintId);
    }
    if (filters?.status) {
      sql += ' AND t.status = ?';
      params.push(filters.status);
    }
    if (filters?.assignedTo) {
      sql += ' AND t.assigned_to = ?';
      params.push(filters.assignedTo);
    }
    if (filters?.priority) {
      sql += ' AND t.priority = ?';
      params.push(filters.priority);
    }
    if (filters?.parentTaskId) {
      sql += ' AND t.parent_task_id = ?';
      params.push(filters.parentTaskId);
    }
    if (filters?.search) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      const q = `%${filters.search}%`;
      params.push(q, q);
    }

    sql += ' ORDER BY t.created_at DESC';

    const rows = database.prepare(sql, params);
    return rows.map((r: any) => this.rowToTask(r));
  }

  update(projectId: string, id: string, params: TaskUpdateParams): TaskRecord | null {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (params.title !== undefined) { fields.push('title = ?'); values.push(params.title); }
    if (params.description !== undefined) { fields.push('description = ?'); values.push(params.description); }
    if (params.assignedTo !== undefined) { fields.push('assigned_to = ?'); values.push(params.assignedTo); }
    if (params.priority !== undefined) { fields.push('priority = ?'); values.push(params.priority); }
    if (params.sprintId !== undefined) { fields.push('sprint_id = ?'); values.push(params.sprintId); }
    if (params.tags !== undefined) { fields.push('tags = ?'); values.push(params.tags); }
    if (params.estimatedHours !== undefined) { fields.push('estimated_hours = ?'); values.push(params.estimatedHours); }
    if (params.actualHours !== undefined) { fields.push('actual_hours = ?'); values.push(params.actualHours); }

    if (fields.length === 0) return this.getById(projectId, id);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(projectId);
    values.push(id);

    database.run(`UPDATE tasks SET ${fields.join(', ')} WHERE project_id = ? AND id = ?`, values);
    return this.getById(projectId, id);
  }

  delete(projectId: string, id: string): void {
    database.run('DELETE FROM tasks WHERE project_id = ? AND id = ?', [projectId, id]);
    logger.info(`Task deleted: ${projectId}/${id}`);
  }

  transition(params: TaskTransitionParams): TaskRecord {
    // Resolve task: use composite key if projectId provided, else fall back to single-id lookup
    const task = params.projectId
      ? this.getById(params.projectId, params.taskId)
      : this.getById(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(params.toStatus)) {
      throw new Error(
        `Invalid transition: ${task.status} → ${params.toStatus}. Allowed: ${allowed?.join(', ') || 'none'}`,
      );
    }

    database.run(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE project_id = ? AND id = ?',
      [params.toStatus, new Date().toISOString(), task.projectId, task.id],
    );

    logger.info(`Task ${task.projectId}/${task.id} transitioned: ${task.status} → ${params.toStatus}`);

    // Append event to task record file
    let eventText = `狀態變更: ${task.status} → ${params.toStatus}`;
    if (params.toStatus === 'assigned' && task.assignedTo) {
      eventText += `\n指派給 ${task.assignedTo}`;
    }
    this.appendTaskEvent(task.projectId, task.id, eventText);

    // Write-back: sync status change to .tasks/ markdown file
    try {
      projectSync.writeBackTaskStatus(task.projectId, task.id, params.toStatus);
    } catch (err) {
      logger.warn(`Task ${task.id} writeBack failed (non-fatal)`, err);
    }

    // Trigger summary for associated sessions only when task is done
    if (params.toStatus === 'done') {
      this.triggerSummaryForTask(task.projectId, task.id);
    }

    // 9C: 任務完成 → 檢查 Sprint 是否所有任務 done
    if (params.toStatus === 'done') {
      const updatedTask = this.getById(task.projectId, task.id);
      if (updatedTask?.sprintId) {
        const allTasks = this.list({ sprintId: updatedTask.sprintId });
        if (allTasks.length > 0 && allTasks.every((t) => t.status === 'done')) {
          eventBus.emit('sprint:all-tasks-done', { sprintId: updatedTask.sprintId });
          logger.info(`All tasks done in sprint ${updatedTask.sprintId}`);
        }
      }
    }

    return this.getById(task.projectId, task.id)!;
  }

  addDependency(projectId: string, taskId: string, dependsOnId: string): void {
    // Prevent self-dependency
    if (taskId === dependsOnId) throw new Error('Task cannot depend on itself');

    // Check both tasks exist
    if (!this.getById(projectId, taskId)) throw new Error(`Task not found: ${taskId}`);
    if (!this.getById(projectId, dependsOnId)) throw new Error(`Dependency task not found: ${dependsOnId}`);

    database.run(
      'INSERT OR IGNORE INTO task_dependencies (project_id, task_id, depends_on) VALUES (?, ?, ?)',
      [projectId, taskId, dependsOnId],
    );
  }

  removeDependency(projectId: string, taskId: string, dependsOnId: string): void {
    database.run(
      'DELETE FROM task_dependencies WHERE project_id = ? AND task_id = ? AND depends_on = ?',
      [projectId, taskId, dependsOnId],
    );
  }

  getDependencies(projectId: string, taskId: string): string[] {
    const rows = database.prepare(
      'SELECT depends_on FROM task_dependencies WHERE project_id = ? AND task_id = ?',
      [projectId, taskId],
    );
    return rows.map((r: any) => r.depends_on as string);
  }

  /**
   * Get tasks that are ready to be worked on (all dependencies done).
   */
  getReadyTasks(projectId: string): TaskRecord[] {
    const tasks = this.list({ projectId, status: 'assigned' });
    return tasks.filter((task) => {
      const deps = this.getDependencies(projectId, task.id);
      if (deps.length === 0) return true;
      return deps.every((depId) => {
        const dep = this.getById(projectId, depId);
        return dep && dep.status === 'done';
      });
    });
  }

  /**
   * Get task counts by status for a project/sprint.
   */
  getStatusCounts(projectId: string, sprintId?: string): Record<TaskStatus, number> {
    let sql = 'SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ?';
    const params: unknown[] = [projectId];

    if (sprintId) {
      sql += ' AND sprint_id = ?';
      params.push(sprintId);
    }

    sql += ' GROUP BY status';
    const rows = database.prepare(sql, params);

    const counts: Record<string, number> = {
      created: 0,
      assigned: 0,
      in_progress: 0,
      in_review: 0,
      blocked: 0,
      rejected: 0,
      done: 0,
    };

    for (const row of rows as any[]) {
      counts[row.status] = row.count;
    }

    return counts as Record<TaskStatus, number>;
  }

  /**
   * Get all sessions associated with a task.
   */
  getSessionsForTask(taskId: string): any[] {
    try {
      return database.prepare(
        'SELECT * FROM claude_sessions WHERE task_id = ? ORDER BY started_at DESC',
        [taskId],
      );
    } catch {
      return [];
    }
  }

  /**
   * Get session counts for multiple tasks at once (batch query).
   */
  getSessionCountsByTask(taskIds: string[]): Record<string, { total: number; active: number }> {
    const result: Record<string, { total: number; active: number }> = {};
    if (taskIds.length === 0) return result;

    try {
      const placeholders = taskIds.map(() => '?').join(',');
      const rows = database.prepare(
        `SELECT task_id, status, COUNT(*) as count
         FROM claude_sessions
         WHERE task_id IN (${placeholders})
         GROUP BY task_id, status`,
        taskIds,
      ) as any[];

      for (const id of taskIds) {
        result[id] = { total: 0, active: 0 };
      }
      for (const row of rows) {
        if (!result[row.task_id]) result[row.task_id] = { total: 0, active: 0 };
        result[row.task_id].total += row.count;
        if (!['completed', 'failed', 'stopped'].includes(row.status)) {
          result[row.task_id].active += row.count;
        }
      }
    } catch {
      // ignore
    }

    return result;
  }

  /**
   * Sanitize a task title for use as filename.
   */
  private sanitizeFileName(title: string): string {
    return title
      .slice(0, 50)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Resolve the .tasks/ directory for a task's project.
   */
  private getTaskRecordDir(task: TaskRecord): string | null {
    try {
      const projRows = database.prepare(
        'SELECT work_dir FROM projects WHERE id = ?',
        [task.projectId],
      );
      const workDir = projRows[0]?.work_dir as string | null;
      if (!workDir) return null;
      return join(workDir, '.tasks');
    } catch {
      return null;
    }
  }

  /**
   * Generate a new task record file in {workDir}/.tasks/{title}.md
   */
  generateTaskRecord(task: TaskRecord): void {
    try {
      const tasksDir = this.getTaskRecordDir(task);
      if (!tasksDir) {
        logger.warn(`Skip task record: project ${task.projectId} has no workDir`);
        return;
      }

      if (!existsSync(tasksDir)) {
        mkdirSync(tasksDir, { recursive: true });
      }

      const fileName = `${this.sanitizeFileName(task.title)}.md`;
      const filePath = join(tasksDir, fileName);

      // Look up sprint name
      let sprintName = '-';
      if (task.sprintId) {
        try {
          const rows = database.prepare('SELECT name FROM sprints WHERE id = ?', [task.sprintId]);
          if (rows.length > 0) sprintName = rows[0].name;
        } catch { /* ignore */ }
      }

      // Look up project name
      let projectName = task.projectId;
      try {
        const rows = database.prepare('SELECT name FROM projects WHERE id = ?', [task.projectId]);
        if (rows.length > 0) projectName = rows[0].name;
      } catch { /* ignore */ }

      const now = new Date().toISOString();
      const dateStr = now.slice(0, 16).replace('T', ' ');

      const content = [
        `# ${task.title}`,
        '',
        '| 欄位 | 值 |',
        '|------|-----|',
        `| ID | ${task.id} |`,
        `| 專案 | ${projectName} |`,
        `| Sprint | ${sprintName} |`,
        `| 建立者 | ${task.createdBy || '-'} |`,
        `| 指派給 | ${task.assignedTo || '-'} |`,
        `| 優先級 | ${task.priority} |`,
        `| 建立時間 | ${now} |`,
        '',
        '---',
        '',
        '## 事件紀錄',
        '',
        `### ${dateStr} — 建立任務`,
        `由 ${task.createdBy || 'user'} 建立`,
        '',
      ].join('\n');

      writeFileSync(filePath, content, 'utf-8');
      logger.info(`Task record generated: ${filePath}`);
    } catch (err) {
      logger.warn('Failed to generate task record', err);
    }
  }

  /**
   * Append an event entry to an existing task record file.
   */
  appendTaskEvent(projectId: string, taskId: string, eventText: string): void {
    try {
      const task = this.getById(projectId, taskId);
      if (!task) return;

      const tasksDir = this.getTaskRecordDir(task);
      if (!tasksDir) return;

      const fileName = `${this.sanitizeFileName(task.title)}.md`;
      const filePath = join(tasksDir, fileName);

      if (!existsSync(filePath)) {
        // File doesn't exist — generate it first
        this.generateTaskRecord(task);
        if (!existsSync(filePath)) return;
      }

      const now = new Date().toISOString();
      const dateStr = now.slice(0, 16).replace('T', ' ');

      const entry = [
        '',
        `### ${dateStr} — ${eventText}`,
        '',
      ].join('\n');

      const existing = readFileSync(filePath, 'utf-8');
      writeFileSync(filePath, existing.trimEnd() + '\n' + entry, 'utf-8');
      logger.info(`Task event appended: ${filePath}`);
    } catch (err) {
      logger.warn('Failed to append task event', err);
    }
  }

  /**
   * Trigger summary for all non-terminal sessions associated with a task.
   * Uses lazy require to avoid circular dependency with session-manager.
   */
  private triggerSummaryForTask(projectId: string, taskId: string): void {
    try {
      const terminalStatuses = ['completed', 'failed', 'stopped'];
      const rows = database.prepare(
        `SELECT id FROM claude_sessions WHERE project_id = ? AND task_id = ? AND status NOT IN (${terminalStatuses.map(() => '?').join(',')})`,
        [projectId, taskId, ...terminalStatuses],
      ) as Array<{ id: string }>;

      if (rows.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sessionManager } = require('./session-manager') as {
        sessionManager: { triggerSummary: (sessionId: string) => string | null };
      };

      for (const row of rows) {
        try {
          sessionManager.triggerSummary(row.id);
          logger.info(`Summary triggered for session ${row.id} (task ${taskId})`);
        } catch (err) {
          logger.warn(`Failed to trigger summary for session ${row.id}`, err);
        }
      }
    } catch (err) {
      logger.warn('Failed to trigger summary for task sessions', err);
    }
  }

  private rowToTask(row: any): TaskRecord {
    // Load dependencies (composite key)
    const deps = this.getDependencies(row.project_id, row.id);

    return {
      id: row.id,
      projectId: row.project_id,
      sprintId: row.sprint_id || null,
      sprintName: row.sprint_name || null,
      parentTaskId: row.parent_task_id || null,
      title: row.title,
      description: row.description || '',
      status: row.status,
      assignedTo: row.assigned_to || null,
      createdBy: row.created_by || null,
      priority: row.priority || 'medium',
      tags: row.tags || null,
      estimatedHours: row.estimated_hours || null,
      actualHours: row.actual_hours || null,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
      dependsOn: deps,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const taskManager = new TaskManager();

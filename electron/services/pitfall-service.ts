import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { database } from './database';
import { logger } from '../utils/logger';

export interface OverduePitfall {
  project: string;
  title: string;
  category: string;
  dueDate: string;
  daysOverdue: number;
  problem: string;
}

class PitfallService {
  /**
   * Scan all projects' postmortem-log.md for overdue pitfalls (status=open, due_date < today)
   */
  getOverdue(): OverduePitfall[] {
    const results: OverduePitfall[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all project work directories from DB
    const projectRows = database.prepare(
      'SELECT name, work_dir FROM projects WHERE work_dir IS NOT NULL',
    );

    for (const row of projectRows) {
      const workDir = row.work_dir as string;
      const projectName = row.name as string;
      const logPath = join(workDir, '.knowledge', 'postmortem-log.md');

      if (!existsSync(logPath)) continue;

      try {
        const content = readFileSync(logPath, 'utf-8');
        const entries = this.parsePostmortemLog(content);

        for (const entry of entries) {
          if (entry.status !== 'open' || !entry.dueDate) continue;

          const due = new Date(entry.dueDate);
          due.setHours(0, 0, 0, 0);

          if (due < today) {
            const diffMs = today.getTime() - due.getTime();
            const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            results.push({
              project: projectName,
              title: entry.title,
              category: entry.category,
              dueDate: entry.dueDate,
              daysOverdue,
              problem: entry.problem,
            });
          }
        }
      } catch (err) {
        logger.warn(`Failed to parse postmortem log for ${projectName}: ${err}`);
      }
    }

    // Sort by most overdue first
    results.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return results;
  }

  /**
   * Parse postmortem-log.md content into structured entries
   */
  private parsePostmortemLog(content: string): Array<{
    title: string;
    category: string;
    status: string;
    dueDate: string;
    problem: string;
  }> {
    const entries: Array<{
      title: string;
      category: string;
      status: string;
      dueDate: string;
      problem: string;
    }> = [];

    // Split by ### headers
    const sections = content.split(/^### /m).filter(Boolean);

    for (const section of sections) {
      const lines = section.trim().split('\n');
      if (lines.length === 0) continue;

      // First line: "{date} — {title}"
      const headerMatch = lines[0].match(/^[\d-]+\s*—\s*(.+)$/);
      if (!headerMatch) continue;

      const title = headerMatch[1].trim();
      let category = '';
      let status = '';
      let dueDate = '';
      let problem = '';

      // Parse table rows
      for (const line of lines) {
        const rowMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
        if (!rowMatch) continue;

        const key = rowMatch[1].trim();
        const value = rowMatch[2].trim();

        if (key === '分類') category = value;
        else if (key === '狀態') status = value;
        else if (key === '到期日') dueDate = value;
        else if (key === '問題') problem = value;
      }

      // Only include entries that have the new format (with status field)
      if (status) {
        entries.push({ title, category, status, dueDate, problem });
      }
    }

    return entries;
  }
}

export const pitfallService = new PitfallService();

import { randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  appendFileSync,
  statSync,
} from 'fs';
import { join, relative } from 'path';
import { ipcMain } from 'electron';
import { database } from '../services/database';
import { getKnowledgeDir } from '../utils/paths';
import { logger } from '../utils/logger';
import { hookManager } from '../services/hook-manager';
import { skillManager } from '../services/skill-manager';
import { projectSync } from '../services/project-sync';
import { IpcChannels } from '../types';
import type {
  ProjectRecord,
  ProjectCreateParams,
  ProjectUpdateParams,
  BudgetStatus,
} from '../types';

function rowToProject(row: any): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    workDir: row.work_dir || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Deploy shared company rules to child project .knowledge/ directory.
 * Source: .knowledge/company/standards/project-rules.md → .knowledge/company-rules.md
 * Source: .knowledge/company/standards/team-workflow.md → .knowledge/team-workflow.md
 */
function scaffoldCompanyRules(workDir: string): string[] {
  const created: string[] = [];
  const knowledgeDir = getKnowledgeDir();
  const destDir = join(workDir, '.knowledge');

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const rules = [
    { src: join(knowledgeDir, 'company', 'standards', 'project-rules.md'), dest: 'company-rules.md' },
    { src: join(knowledgeDir, 'company', 'standards', 'team-workflow.md'), dest: 'team-workflow.md' },
    { src: join(knowledgeDir, 'company', 'standards', 'postmortem-common.md'), dest: 'postmortem-common.md' },
  ];

  for (const { src, dest } of rules) {
    const destPath = join(destDir, dest);
    if (existsSync(src) && !existsSync(destPath)) {
      copyFileSync(src, destPath);
      created.push(`.knowledge/${dest}`);
    }
  }

  // Deploy company templates (sprint-proposal, dev-plan, etc.)
  const templatesDir = join(knowledgeDir, 'company', 'templates');
  const destTemplatesDir = join(destDir, 'templates');
  if (existsSync(templatesDir)) {
    if (!existsSync(destTemplatesDir)) {
      mkdirSync(destTemplatesDir, { recursive: true });
    }
    const templateFiles = readdirSync(templatesDir).filter((f) => f.endsWith('.template'));
    for (const file of templateFiles) {
      const destPath = join(destTemplatesDir, file);
      if (!existsSync(destPath)) {
        copyFileSync(join(templatesDir, file), destPath);
        created.push(`.knowledge/templates/${file}`);
      }
    }
  }

  return created;
}

export function registerProjectHandlers(): void {
  ipcMain.handle(IpcChannels.PROJECT_CREATE, (_e, params: ProjectCreateParams) => {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Auto-create work directory if specified and doesn't exist
    if (params.workDir) {
      if (!existsSync(params.workDir)) {
        mkdirSync(params.workDir, { recursive: true });
      }

      // Scaffold CLAUDE.md + .knowledge/ from project template
      if (params.template && params.template !== 'blank') {
        try {
          const templateDir = join(
            getKnowledgeDir(),
            'company',
            'project-templates',
            params.template,
          );
          const tmplPath = join(templateDir, 'CLAUDE.md.template');
          const archPath = join(templateDir, 'architecture.md');
          const destClaude = join(params.workDir, 'CLAUDE.md');
          const destKnowledgeDir = join(params.workDir, '.knowledge');

          // Write CLAUDE.md (don't overwrite existing)
          if (existsSync(tmplPath) && !existsSync(destClaude)) {
            const agentHubPath = process.cwd().replace(/\\/g, '/');
            const content = readFileSync(tmplPath, 'utf-8')
              .replace(/\{專案名稱\}/g, params.name)
              .replace(/\{\{AGENT_HUB_PATH\}\}/g, agentHubPath);
            writeFileSync(destClaude, content, 'utf-8');
          }

          // Copy architecture.md → .knowledge/architecture.md
          if (existsSync(archPath)) {
            if (!existsSync(destKnowledgeDir)) {
              mkdirSync(destKnowledgeDir, { recursive: true });
            }
            const destArch = join(destKnowledgeDir, 'architecture.md');
            if (!existsSync(destArch)) {
              copyFileSync(archPath, destArch);
            }
          }
        } catch (err) {
          logger.warn('Failed to scaffold project template files', err);
        }
      }

      // Deploy shared company rules regardless of template type
      try {
        const rulesCreated = scaffoldCompanyRules(params.workDir);
        if (rulesCreated.length > 0) {
          logger.info(`Deployed company rules: ${rulesCreated.join(', ')}`);
        }
      } catch (err) {
        logger.warn('Failed to deploy company rules', err);
      }

      // Inject hooks + deploy skills + start file watcher asynchronously (don't block UI)
      const workDirForAsync = params.workDir;
      setImmediate(() => {
        try {
          hookManager.tryInjectHooks(workDirForAsync);
          logger.info(`Hooks injected for new project: ${workDirForAsync}`);
        } catch (err) {
          logger.warn('Failed to inject hooks for new project', err);
        }

        try {
          const allSkills = skillManager.list();
          const systemSkillNames = allSkills
            .filter((s) => s.source === 'system' && s.scope === 'global')
            .map((s) => s.name);
          for (const skillName of systemSkillNames) {
            skillManager.deploy(skillName, [workDirForAsync]);
          }
          if (systemSkillNames.length > 0) {
            logger.info(`Deployed ${systemSkillNames.length} system skills to ${workDirForAsync}`);
          }
        } catch (err) {
          logger.warn('Failed to deploy skills for new project', err);
        }

        // Start file watcher + initial sync so sprints/gates are discovered immediately
        try {
          projectSync.startWatch(id, workDirForAsync);
          projectSync.fullSync(id, workDirForAsync).catch((err) => {
            logger.warn(`Initial fullSync failed for new project ${id}`, err);
          });
          logger.info(`Project sync started for new project ${id}`);
        } catch (err) {
          logger.warn('Failed to start project sync for new project', err);
        }
      });
    }

    database.run(
      `INSERT INTO projects (id, name, description, template, work_dir, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'planning', ?, ?)`,
      [id, params.name, params.description || '', params.template || null, params.workDir || null, now, now],
    );

    // Create default budget (token-based)
    database.run(
      `INSERT INTO project_budgets (project_id, daily_limit, total_limit, daily_token_limit, total_token_limit) VALUES (?, ?, ?, ?, ?)`,
      [id, 5.0, 50.0, 500000, 10000000],
    );

    const rows = database.prepare('SELECT * FROM projects WHERE id = ?', [id]);
    return rowToProject(rows[0]);
  });

  ipcMain.handle(IpcChannels.PROJECT_LIST, () => {
    const rows = database.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    return rows.map((r: any) => rowToProject(r));
  });

  ipcMain.handle(IpcChannels.PROJECT_GET, (_e, id: string) => {
    const rows = database.prepare('SELECT * FROM projects WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const project = rowToProject(rows[0]);
    // Auto-sync: ensure watcher is running and trigger fullSync when project is opened
    if (project.workDir) {
      projectSync.startWatch(id, project.workDir);
      projectSync.fullSync(id, project.workDir).catch((err) => {
        logger.warn(`Auto fullSync failed for project ${id}`, err);
      });
    }
    return project;
  });

  ipcMain.handle(IpcChannels.PROJECT_UPDATE, (_e, id: string, params: ProjectUpdateParams) => {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (params.name !== undefined) { fields.push('name = ?'); values.push(params.name); }
    if (params.description !== undefined) { fields.push('description = ?'); values.push(params.description); }
    if (params.status !== undefined) { fields.push('status = ?'); values.push(params.status); }
    if (params.workDir !== undefined) { fields.push('work_dir = ?'); values.push(params.workDir); }

    if (fields.length === 0) return null;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    database.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);

    const rows = database.prepare('SELECT * FROM projects WHERE id = ?', [id]);
    return rowToProject(rows[0]);
  });

  ipcMain.handle(IpcChannels.PROJECT_DELETE, (_e, id: string) => {
    database.run('DELETE FROM projects WHERE id = ?', [id]);
    return { success: true };
  });

  ipcMain.handle(IpcChannels.PROJECT_GET_STATS, (_e, projectId: string) => {
    // Task counts by status
    const taskRows = database.prepare(
      `SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status`,
      [projectId],
    );
    let tasksDone = 0;
    let tasksInProgress = 0;
    let totalTasks = 0;
    for (const row of taskRows as any[]) {
      totalTasks += row.count;
      if (row.status === 'done') tasksDone = row.count;
      if (row.status === 'in_progress') tasksInProgress += row.count;
      if (row.status === 'in_review') tasksInProgress += row.count;
    }

    // Total tokens + cost
    const costRows = database.prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
              COALESCE(SUM(cost_usd), 0) as total_usd
       FROM claude_sessions WHERE project_id = ?`,
      [projectId],
    );
    const totalTokens = (costRows[0] as any)?.total_tokens || 0;
    const totalCostUsd = (costRows[0] as any)?.total_usd || 0;

    // Active sprints + gate progress (approved gates / total gates)
    let activeSprint: { name: string; progressPct: number; activeCount: number } | null = null;
    const sprintRows = database.prepare(
      `SELECT id, name FROM sprints WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC`,
      [projectId],
    );
    if (sprintRows.length > 0) {
      const ids = sprintRows.map((r: any) => r.id);
      const ph = ids.map(() => '?').join(',');
      const gateAgg = database.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
         FROM gates WHERE sprint_id IN (${ph})`,
        ids,
      );
      const total = (gateAgg[0] as any)?.total || 0;
      const approved = (gateAgg[0] as any)?.approved || 0;
      const progressPct = total > 0 ? Math.round((approved / total) * 100) : 0;

      const name = sprintRows.length === 1
        ? (sprintRows[0] as any).name
        : `${sprintRows.length} 個 Sprint 進行中`;
      activeSprint = { name, progressPct, activeCount: sprintRows.length };
    }

    // Latest gate — scope to active sprints if any exist
    let latestGate: { type: string; status: string } | null = null;
    let gateRows: any[];
    if (sprintRows.length > 0) {
      const sprintIds = sprintRows.map((r: any) => r.id);
      const ph = sprintIds.map(() => '?').join(',');
      gateRows = database.prepare(
        `SELECT gate_type, status FROM gates WHERE project_id = ? AND sprint_id IN (${ph}) ORDER BY created_at DESC LIMIT 1`,
        [projectId, ...sprintIds],
      );
    } else {
      gateRows = database.prepare(
        `SELECT gate_type, status FROM gates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
        [projectId],
      );
    }
    if (gateRows.length > 0) {
      const gate = gateRows[0] as any;
      latestGate = { type: gate.gate_type, status: gate.status };
    }

    return { tasksDone, tasksInProgress, totalTasks, totalTokens, totalCostUsd, activeSprint, latestGate };
  });

  ipcMain.handle(IpcChannels.PROJECT_GET_BUDGET, (_e, projectId: string): BudgetStatus => {
    // Get token-based budget limits
    const budgetRows = database.prepare(
      'SELECT * FROM project_budgets WHERE project_id = ?',
      [projectId],
    );

    const dailyTokenLimit = budgetRows.length > 0
      ? (budgetRows[0] as any).daily_token_limit || 500000
      : 500000;
    const totalTokenLimit = budgetRows.length > 0
      ? (budgetRows[0] as any).total_token_limit || 10000000
      : 10000000;

    // Get today's token usage
    const today = new Date().toISOString().split('T')[0];
    const dailyRows = database.prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM claude_sessions
       WHERE project_id = ? AND started_at >= ?`,
      [projectId, today],
    );
    const dailyTokensUsed = (dailyRows[0] as any)?.total || 0;

    // Get total token usage
    const totalRows = database.prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM claude_sessions WHERE project_id = ?`,
      [projectId],
    );
    const totalTokensUsed = (totalRows[0] as any)?.total || 0;

    const dailyPct = dailyTokenLimit > 0 ? Math.round((dailyTokensUsed / dailyTokenLimit) * 100) : 0;
    const totalPct = totalTokenLimit > 0 ? Math.round((totalTokensUsed / totalTokenLimit) * 100) : 0;

    let alertLevel: BudgetStatus['alertLevel'] = 'normal';
    if (dailyPct >= 100 || totalPct >= 100) alertLevel = 'exceeded';
    else if (dailyPct >= 90 || totalPct >= 90) alertLevel = 'critical';
    else if (dailyPct >= 80 || totalPct >= 80) alertLevel = 'warning';

    return { dailyTokensUsed, dailyTokenLimit, dailyPct, totalTokensUsed, totalTokenLimit, totalPct, alertLevel };
  });

  // 8A-1: Initialize .claude/ directory for a project
  ipcMain.handle(
    IpcChannels.PROJECT_INIT_CLAUDE_DIR,
    (_e, projectId: string): { success: boolean; created: string[]; error?: string } => {
      try {
        const rows = database.prepare('SELECT work_dir FROM projects WHERE id = ?', [projectId]);
        const workDir = rows[0]?.work_dir as string | null;
        if (!workDir) return { success: false, created: [], error: '專案沒有工作目錄' };

        const claudeDir = join(workDir, '.claude');
        const skillsDir = join(claudeDir, 'skills');
        const created: string[] = [];

        if (!existsSync(claudeDir)) {
          mkdirSync(claudeDir, { recursive: true });
          created.push('.claude/');
        }
        if (!existsSync(skillsDir)) {
          mkdirSync(skillsDir, { recursive: true });
          created.push('.claude/skills/');
        }

        // Handle .gitignore — add .claude/ if not already present
        const gitignorePath = join(workDir, '.gitignore');
        if (existsSync(gitignorePath)) {
          const content = readFileSync(gitignorePath, 'utf-8');
          if (!content.includes('.claude/')) {
            appendFileSync(gitignorePath, '\n# Claude Code\n.claude/\n');
            created.push('.gitignore (updated)');
          }
        } else {
          writeFileSync(gitignorePath, '# Claude Code\n.claude/\n', 'utf-8');
          created.push('.gitignore (created)');
        }

        logger.info(`Claude dir initialized for project ${projectId}: ${created.join(', ')}`);
        return { success: true, created };
      } catch (err) {
        logger.warn('Failed to initialize .claude/ directory', err);
        return { success: false, created: [], error: String(err) };
      }
    },
  );

  // 8A-1: Get .claude/ directory contents for a project
  ipcMain.handle(
    IpcChannels.PROJECT_GET_CLAUDE_DIR,
    (_e, projectId: string): { exists: boolean; files: Array<{ path: string; type: 'file' | 'dir' }> } => {
      try {
        const rows = database.prepare('SELECT work_dir FROM projects WHERE id = ?', [projectId]);
        const workDir = rows[0]?.work_dir as string | null;
        if (!workDir) return { exists: false, files: [] };

        const claudeDir = join(workDir, '.claude');
        if (!existsSync(claudeDir)) return { exists: false, files: [] };

        const files: Array<{ path: string; type: 'file' | 'dir' }> = [];
        function walk(dir: string): void {
          const entries = readdirSync(dir);
          for (const entry of entries) {
            const fullPath = join(dir, entry);
            const relPath = relative(claudeDir, fullPath).replace(/\\/g, '/');
            try {
              const stat = statSync(fullPath);
              if (stat.isDirectory()) {
                files.push({ path: relPath + '/', type: 'dir' });
                walk(fullPath);
              } else {
                files.push({ path: relPath, type: 'file' });
              }
            } catch { /* skip inaccessible */ }
          }
        }
        walk(claudeDir);
        return { exists: true, files };
      } catch {
        return { exists: false, files: [] };
      }
    },
  );
}

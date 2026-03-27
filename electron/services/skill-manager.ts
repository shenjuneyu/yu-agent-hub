import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { database } from './database';
import { logger } from '../utils/logger';

export interface SkillExportItem {
  name: string;
  content: string;
  source: 'system' | 'user';
  scope: 'global' | 'project';
}

export interface SkillExportBundle {
  version: number;
  exportedAt: string;
  skills: SkillExportItem[];
}

export interface SkillImportResult {
  imported: string[];
  skipped: string[];
  overwritten: string[];
  errors: string[];
}

export interface SkillListItem {
  name: string;
  source: 'system' | 'user';
  scope: 'global' | 'project';
  projectPath?: string;
  enabled: boolean;
}

export interface SkillDetail {
  name: string;
  source: 'system' | 'user';
  scope: 'global' | 'project';
  projectPath?: string;
  enabled: boolean;
  content: string;
  deployedTo: string[]; // project workDirs where deployed (global skills only)
}

class SkillManager {
  private get systemSkillsDir(): string {
    return join(process.cwd(), 'knowledge', 'company', 'skill-templates');
  }

  private get userSkillsDir(): string {
    return join(process.cwd(), 'knowledge', 'user', 'skill-templates');
  }

  /**
   * Scan skill directories and return a flat list with scope metadata.
   *
   * Always scans:
   *   - knowledge/company/skill-templates/  → source=system, scope=global
   *   - knowledge/user/skill-templates/     → source=user, scope=global
   *
   * Project-scoped skills (source=user, scope=project):
   *   - If projectPath is supplied → only that project's .claude/commands/
   *   - If no projectPath         → every project from the DB projects table
   */
  list(projectPath?: string): SkillListItem[] {
    const results: SkillListItem[] = [];

    // ── Global skills ──────────────────────────────────────────────────────
    const scanGlobalDir = (dir: string, source: 'system' | 'user') => {
      if (!existsSync(dir)) return;

      let entries: string[] = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch (err) {
        logger.warn(`Failed to read skill templates dir: ${dir}`, err);
        return;
      }

      for (const name of entries) {
        const skillFile = join(dir, name, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        const enabled = this.getEnabledState(name, 'global', null);
        results.push({ name, source, scope: 'global', enabled });
      }
    };

    scanGlobalDir(this.systemSkillsDir, 'system');
    scanGlobalDir(this.userSkillsDir, 'user');

    // ── Project-scoped skills ──────────────────────────────────────────────
    const scanProjectDir = (projPath: string) => {
      const commandsDir = join(projPath, '.claude', 'commands');
      if (!existsSync(commandsDir)) return;

      let files: string[] = [];
      try {
        files = readdirSync(commandsDir, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .map((e) => e.name);
      } catch (err) {
        logger.warn(`Failed to read project commands dir: ${commandsDir}`, err);
        return;
      }

      for (const fileName of files) {
        const name = fileName.replace(/\.md$/, '');
        const enabled = this.getEnabledState(name, 'project', projPath);
        results.push({ name, source: 'user', scope: 'project', projectPath: projPath, enabled });
      }
    };

    if (projectPath) {
      scanProjectDir(projectPath);
    } else {
      // Scan all projects from DB
      const projectRows = database.prepare(
        'SELECT work_dir FROM projects WHERE work_dir IS NOT NULL',
      );
      for (const row of projectRows) {
        const workDir = row.work_dir as string | null;
        if (workDir) scanProjectDir(workDir);
      }
    }

    return results;
  }

  /**
   * Get full details for a single skill.
   *
   * Routing:
   *   scope=global (default): user skill-templates, then system skill-templates
   *   scope=project + projectPath: {projectPath}/.claude/commands/{name}.md
   */
  get(name: string, scope?: string, projectPath?: string): SkillDetail {
    const resolvedScope = scope === 'project' ? 'project' : 'global';

    if (resolvedScope === 'project') {
      if (!projectPath) {
        throw new Error('projectPath is required for project-scoped skill get');
      }
      const filePath = join(projectPath, '.claude', 'commands', `${name}.md`);
      if (!existsSync(filePath)) {
        throw new Error(`Project skill not found: ${name} in ${projectPath}`);
      }
      const content = readFileSync(filePath, 'utf-8');
      const enabled = this.getEnabledState(name, 'project', projectPath);
      return { name, source: 'user', scope: 'project', projectPath, enabled, content, deployedTo: [] };
    }

    // Global scope
    const systemPath = join(this.systemSkillsDir, name, 'SKILL.md');
    const userPath = join(this.userSkillsDir, name, 'SKILL.md');

    let source: 'system' | 'user';
    let skillFilePath: string;

    if (existsSync(userPath)) {
      source = 'user';
      skillFilePath = userPath;
    } else if (existsSync(systemPath)) {
      source = 'system';
      skillFilePath = systemPath;
    } else {
      throw new Error(`Skill not found: ${name}`);
    }

    const content = readFileSync(skillFilePath, 'utf-8');
    const enabled = this.getEnabledState(name, 'global', null);
    const deployedTo = this.findDeployedLocations(name);

    return { name, source, scope: 'global', enabled, content, deployedTo };
  }

  /**
   * Create a new skill.
   *
   * Routing:
   *   scope=global (default): knowledge/user/skill-templates/{name}/SKILL.md
   *   scope=project + projectPath: {projectPath}/.claude/commands/{name}.md
   */
  create(name: string, content: string, scope?: string, projectPath?: string): { success: boolean; path: string } {
    const resolvedScope = scope === 'project' ? 'project' : 'global';

    if (resolvedScope === 'project') {
      if (!projectPath) {
        throw new Error('projectPath is required for project-scoped skill create');
      }
      const commandsDir = join(projectPath, '.claude', 'commands');
      const filePath = join(commandsDir, `${name}.md`);
      if (existsSync(filePath)) {
        throw new Error(`Project skill already exists: ${name} in ${projectPath}`);
      }
      mkdirSync(commandsDir, { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      logger.info(`Project skill created: ${filePath}`);
      return { success: true, path: filePath };
    }

    // Global scope
    const skillDir = join(this.userSkillsDir, name);
    const skillFile = join(skillDir, 'SKILL.md');

    if (existsSync(skillFile)) {
      throw new Error(`Skill already exists: ${name}`);
    }

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, content, 'utf-8');
    logger.info(`Skill created: ${skillFile}`);
    return { success: true, path: skillFile };
  }

  /**
   * Update skill content. Only user/project skills can be updated.
   *
   * Routing mirrors create().
   */
  update(name: string, content: string, scope?: string, projectPath?: string): { success: boolean } {
    const resolvedScope = scope === 'project' ? 'project' : 'global';

    if (resolvedScope === 'project') {
      if (!projectPath) {
        throw new Error('projectPath is required for project-scoped skill update');
      }
      const filePath = join(projectPath, '.claude', 'commands', `${name}.md`);
      if (!existsSync(filePath)) {
        throw new Error(`Project skill not found: ${name} in ${projectPath}`);
      }
      writeFileSync(filePath, content, 'utf-8');
      logger.info(`Project skill updated: ${filePath}`);
      return { success: true };
    }

    // Global scope
    const userPath = join(this.userSkillsDir, name, 'SKILL.md');
    if (!existsSync(userPath)) {
      const systemPath = join(this.systemSkillsDir, name, 'SKILL.md');
      if (existsSync(systemPath)) {
        throw new Error(`Cannot update system skill: ${name}`);
      }
      throw new Error(`Skill not found: ${name}`);
    }

    writeFileSync(userPath, content, 'utf-8');
    logger.info(`Skill updated: ${userPath}`);
    return { success: true };
  }

  /**
   * Delete a skill.
   *
   * scope=global: removes from user skill-templates; system skills are refused.
   * scope=project: removes {projectPath}/.claude/commands/{name}.md
   */
  delete(name: string, scope?: string, projectPath?: string): { success: boolean } {
    const resolvedScope = scope === 'project' ? 'project' : 'global';

    if (resolvedScope === 'project') {
      if (!projectPath) {
        throw new Error('projectPath is required for project-scoped skill delete');
      }
      const filePath = join(projectPath, '.claude', 'commands', `${name}.md`);
      if (!existsSync(filePath)) {
        throw new Error(`Project skill not found: ${name} in ${projectPath}`);
      }
      rmSync(filePath);
      logger.info(`Project skill deleted: ${filePath}`);
      return { success: true };
    }

    // Global scope
    const userDir = join(this.userSkillsDir, name);
    if (!existsSync(userDir)) {
      const systemDir = join(this.systemSkillsDir, name);
      if (existsSync(systemDir)) {
        throw new Error(`Cannot delete system skill: ${name}`);
      }
      throw new Error(`Skill not found: ${name}`);
    }

    rmSync(userDir, { recursive: true, force: true });
    logger.info(`Skill deleted: ${userDir}`);
    return { success: true };
  }

  /**
   * Deploy a global skill to one or more project workDirs.
   * Copies SKILL.md to {workDir}/.claude/commands/{name}.md
   *
   * Project-scoped skills cannot be deployed (they already live in a project).
   */
  deploy(name: string, projects: string[]): { success: boolean; deployed: string[] } {
    const userPath = join(this.userSkillsDir, name, 'SKILL.md');
    const systemPath = join(this.systemSkillsDir, name, 'SKILL.md');

    let sourcePath: string;
    if (existsSync(userPath)) {
      sourcePath = userPath;
    } else if (existsSync(systemPath)) {
      sourcePath = systemPath;
    } else {
      throw new Error(`Skill not found: ${name}`);
    }

    const deployed: string[] = [];

    for (const workDir of projects) {
      try {
        const commandsDir = join(workDir, '.claude', 'commands');
        mkdirSync(commandsDir, { recursive: true });

        const destPath = join(commandsDir, `${name}.md`);
        copyFileSync(sourcePath, destPath);
        deployed.push(workDir);
        logger.info(`Skill '${name}' deployed to: ${destPath}`);
      } catch (err) {
        logger.warn(`Failed to deploy skill '${name}' to ${workDir}: ${err}`);
      }
    }

    return { success: true, deployed };
  }

  /**
   * Enable or disable a skill. The composite key (name, scope, project_path)
   * is used for the upsert so global and project skills are tracked separately.
   */
  toggle(name: string, enabled: boolean, scope?: string, projectPath?: string): { success: boolean } {
    const resolvedScope = scope === 'project' ? 'project' : 'global';
    const projPath = resolvedScope === 'project' ? (projectPath ?? null) : null;
    const enabledInt = enabled ? 1 : 0;

    database.run(
      `INSERT INTO skill_settings (name, scope, project_path, enabled, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(name, scope, project_path) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [name, resolvedScope, projPath, enabledInt],
    );

    logger.info(`Skill '${name}' (scope=${resolvedScope}, project=${projPath ?? 'n/a'}) toggled: enabled=${enabled}`);
    return { success: true };
  }

  /**
   * Export one or more global skills as a portable JSON bundle.
   * Both system and user global skills can be exported.
   * Project-scoped skills are not supported by export (they belong to a project).
   */
  exportBundle(names: string[]): SkillExportBundle {
    const skills: SkillExportItem[] = [];

    for (const name of names) {
      try {
        const detail = this.get(name, 'global');
        skills.push({
          name: detail.name,
          content: detail.content,
          source: detail.source,
          scope: 'global',
        });
      } catch (err) {
        logger.warn(`skill export: skipping '${name}': ${err}`);
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      skills,
    };
  }

  /**
   * Import skills from a JSON bundle into user skill-templates.
   * System skills in the bundle are imported as user skills.
   * onConflict='skip'      → leave existing user skill untouched
   * onConflict='overwrite' → overwrite existing user skill content
   *
   * System skills that already exist on disk cannot be overwritten;
   * they are recorded as errors.
   */
  importBundle(bundle: SkillExportBundle, onConflict: 'skip' | 'overwrite'): SkillImportResult {
    const result: SkillImportResult = {
      imported: [],
      skipped: [],
      overwritten: [],
      errors: [],
    };

    for (const item of bundle.skills) {
      try {
        const userPath = join(this.userSkillsDir, item.name, 'SKILL.md');
        const systemPath = join(this.systemSkillsDir, item.name, 'SKILL.md');
        const userExists = existsSync(userPath);
        const systemExists = existsSync(systemPath);

        if (systemExists && !userExists) {
          // Cannot overwrite a system skill — always error
          result.errors.push(`${item.name}: is a system skill and cannot be overwritten`);
          continue;
        }

        if (userExists) {
          if (onConflict === 'skip') {
            result.skipped.push(item.name);
            continue;
          }
          // overwrite
          writeFileSync(userPath, item.content, 'utf-8');
          logger.info(`Skill importBundle: overwritten '${item.name}'`);
          result.overwritten.push(item.name);
        } else {
          // create new user skill
          const skillDir = join(this.userSkillsDir, item.name);
          mkdirSync(skillDir, { recursive: true });
          writeFileSync(userPath, item.content, 'utf-8');
          logger.info(`Skill importBundle: imported '${item.name}'`);
          result.imported.push(item.name);
        }
      } catch (err) {
        logger.error(`Skill importBundle: failed for '${item.name}': ${err}`);
        result.errors.push(`${item.name}: ${String(err)}`);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getEnabledState(name: string, scope: string, projectPath: string | null): boolean {
    const rows = database.prepare(
      'SELECT enabled FROM skill_settings WHERE name = ? AND scope = ? AND project_path IS ?',
      [name, scope, projectPath],
    );
    if (rows.length === 0) return true; // default: enabled
    return (rows[0].enabled as number) === 1;
  }

  private findDeployedLocations(name: string): string[] {
    const projectRows = database.prepare('SELECT work_dir FROM projects WHERE work_dir IS NOT NULL');
    const deployed: string[] = [];

    for (const row of projectRows) {
      const workDir = row.work_dir as string | null;
      if (!workDir) continue;
      const commandFile = join(workDir, '.claude', 'commands', `${name}.md`);
      if (existsSync(commandFile)) {
        deployed.push(workDir);
      }
    }

    return deployed;
  }
}

export const skillManager = new SkillManager();

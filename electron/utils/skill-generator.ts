import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { agentLoader } from '../services/agent-loader';
import { logger } from './logger';

export interface SkillGenerateResult {
  status: 'written' | 'skipped' | 'conflict';
  filePath: string;
  agentId: string;
}

/**
 * Convert an Agent definition into a Claude Code SKILL.md format.
 */
function agentToSkillContent(agentId: string): string {
  const agent = agentLoader.getById(agentId);
  if (!agent) return '';

  const systemPrompt = agentLoader.getSystemPrompt(agentId);
  const description = agent.description || `${agent.name} Agent`;

  const lines: string[] = [
    '---',
    `name: ${agentId}`,
    `description: >`,
    `  ${description}`,
    '---',
    '',
  ];

  // Extract and reformat system prompt sections
  if (systemPrompt) {
    // Split system prompt into logical sections
    const sections = systemPrompt.split(/^##\s+/m).filter(Boolean);

    for (const section of sections) {
      const firstLine = section.split('\n')[0].trim();
      const body = section.slice(firstLine.length).trim();

      if (firstLine) {
        lines.push(`## ${firstLine}`);
        lines.push('');
        if (body) {
          lines.push(body);
          lines.push('');
        }
      }
    }
  }

  // Add metadata footer
  lines.push('## Agent 資訊');
  lines.push('');
  lines.push(`- **部門**: ${agent.department}`);
  lines.push(`- **層級**: ${agent.level}`);
  if (agent.manages && agent.manages.length > 0) {
    lines.push(`- **管轄**: ${agent.manages.join(', ')}`);
  }
  if (agent.reportsTo) {
    lines.push(`- **上級**: ${agent.reportsTo}`);
  }
  lines.push('');

  // Add reference to .knowledge/ files
  lines.push('## 參考文件');
  lines.push('');
  lines.push('需要時讀取以下文件：');
  lines.push('- `.knowledge/` — 專案技術文件');
  lines.push('- `CLAUDE.md` — 專案索引與規範');
  lines.push('');

  return lines.join('\n');
}

/**
 * Check if an existing SKILL.md was manually modified (different from generated content).
 */
function wasManuallyModified(filePath: string, newContent: string): boolean {
  if (!existsSync(filePath)) return false;

  const existing = readFileSync(filePath, 'utf-8');
  const existingHash = createHash('md5').update(existing.trim()).digest('hex');
  const newHash = createHash('md5').update(newContent.trim()).digest('hex');

  return existingHash !== newHash;
}

/**
 * Generate SKILL.md for an agent in the project's .claude/skills/ directory.
 */
export function generateSkillFile(
  workDir: string,
  agentId: string,
  force = false,
): SkillGenerateResult {
  const skillsDir = join(workDir, '.claude', 'skills', agentId);
  const filePath = join(skillsDir, 'SKILL.md');

  const content = agentToSkillContent(agentId);
  if (!content) {
    return { status: 'skipped', filePath, agentId };
  }

  // Check for manual modifications
  if (existsSync(filePath) && !force) {
    if (wasManuallyModified(filePath, content)) {
      logger.info(`Skill file conflict: ${filePath} was manually modified`);
      return { status: 'conflict', filePath, agentId };
    }
  }

  // Write the file
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  writeFileSync(filePath, content, 'utf-8');
  logger.info(`Skill file generated: ${filePath}`);
  return { status: 'written', filePath, agentId };
}

/**
 * Generate SKILL.md files for all agents used in a project.
 * Returns results for each agent.
 */
export function generateAllSkillFiles(
  workDir: string,
  agentIds?: string[],
): SkillGenerateResult[] {
  const ids = agentIds || agentLoader.getAll().map((a) => a.id);
  return ids.map((id) => generateSkillFile(workDir, id));
}

export interface WorkflowSkillResult {
  status: 'written' | 'skipped' | 'conflict';
  filePath: string;
  skillName: string;
}

/**
 * Locate the knowledge/company/skill-templates/ directory by trying multiple candidate paths.
 */
function findSkillTemplatesDir(): string | null {
  const candidates = [
    join(process.cwd(), 'knowledge', 'company', 'skill-templates'),
    join(__dirname, '..', '..', 'knowledge', 'company', 'skill-templates'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Skills that should only be deployed to AgentHub itself, not to child projects */
const AGENTHUB_ONLY_SKILLS = new Set(['knowledge-feedback']);

/**
 * Deploy workflow SKILL.md files from knowledge/company/skill-templates/ into the
 * child project at {workDir}/.claude/skills/{skill-name}/SKILL.md.
 *
 * Uses the same hash-based anti-overwrite mechanism as generateSkillFile().
 * Skills listed in AGENTHUB_ONLY_SKILLS are skipped for child projects.
 */
export function deployWorkflowSkills(workDir: string): WorkflowSkillResult[] {
  const templateDir = findSkillTemplatesDir();
  if (!templateDir) {
    logger.warn('deployWorkflowSkills: skill-templates directory not found');
    return [];
  }

  const results: WorkflowSkillResult[] = [];

  let entries: string[];
  try {
    entries = readdirSync(templateDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    logger.warn(`deployWorkflowSkills: failed to read template dir: ${err}`);
    return [];
  }

  const isAgentHub = workDir === process.cwd();

  for (const skillName of entries) {
    // Skip AgentHub-only skills when deploying to child projects
    if (AGENTHUB_ONLY_SKILLS.has(skillName) && !isAgentHub) {
      results.push({ status: 'skipped', filePath: join(workDir, '.claude', 'skills', skillName, 'SKILL.md'), skillName });
      continue;
    }

    const sourcePath = join(templateDir, skillName, 'SKILL.md');
    if (!existsSync(sourcePath)) {
      logger.info(`deployWorkflowSkills: no SKILL.md in template "${skillName}", skipping`);
      results.push({ status: 'skipped', filePath: sourcePath, skillName });
      continue;
    }

    const destDir = join(workDir, '.claude', 'skills', skillName);
    const destPath = join(destDir, 'SKILL.md');

    let content: string;
    try {
      content = readFileSync(sourcePath, 'utf-8');
    } catch (err) {
      logger.warn(`deployWorkflowSkills: failed to read "${sourcePath}": ${err}`);
      results.push({ status: 'skipped', filePath: destPath, skillName });
      continue;
    }

    if (existsSync(destPath)) {
      if (wasManuallyModified(destPath, content)) {
        logger.info(`Workflow skill conflict: ${destPath} was manually modified`);
        results.push({ status: 'conflict', filePath: destPath, skillName });
        continue;
      }
      // Content identical — no need to write again
      results.push({ status: 'skipped', filePath: destPath, skillName });
      continue;
    }

    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    writeFileSync(destPath, content, 'utf-8');
    logger.info(`Workflow skill deployed: ${destPath}`);
    results.push({ status: 'written', filePath: destPath, skillName });
  }

  return results;
}

/**
 * Deploy both agent skills and workflow skills to a child project in one call.
 */
export function generateAllSkillsForProject(
  workDir: string,
  agentId?: string,
): Array<SkillGenerateResult | WorkflowSkillResult> {
  const agentResults = agentId
    ? [generateSkillFile(workDir, agentId)]
    : generateAllSkillFiles(workDir);

  const workflowResults = deployWorkflowSkills(workDir);

  return [...agentResults, ...workflowResults];
}

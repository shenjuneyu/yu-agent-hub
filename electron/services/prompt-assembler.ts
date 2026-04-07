import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { agentLoader } from './agent-loader';
import { database } from './database';
import { getKnowledgeDir, safePath } from '../utils/paths';
import { logger } from '../utils/logger';

interface AssembleOptions {
  parentSessionId?: string;
  taskId?: string;
  projectId?: string;
}

class PromptAssembler {
  /**
   * Assemble a complete system prompt for an agent.
   * Format: Role definition + Knowledge refs + Memory + Communication + Decisions + Previous session + Agent metadata
   */
  assemble(agentId: string, projectId?: string | null, options?: AssembleOptions): string {
    const agent = agentLoader.getById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const sections: string[] = [];

    // 1. Role definition (from agent .md file) — wrapped in <important> to survive context compaction
    const systemPrompt = agentLoader.getSystemPrompt(agentId);
    if (systemPrompt) {
      sections.push(`<important>\n${systemPrompt}\n</important>`);
    }

    // 2. Resolve knowledge references (company:// and project://)
    const knowledgeRefs = this.extractKnowledgeRefs(systemPrompt);
    if (knowledgeRefs.length > 0) {
      const resolved = this.resolveKnowledgeRefs(knowledgeRefs, projectId);
      if (resolved) {
        sections.push('\n---\n\n## 參考知識\n\n' + resolved);
      }
    }

    // 2b. Company manager: inject child project list
    if (agentId === 'company-manager') {
      const companyCtx = this.assembleCompanyManagerContext();
      if (companyCtx) {
        sections.push(companyCtx);
      }
    }

    // 3. Previous session context (for continuation sessions)
    if (options?.parentSessionId) {
      try {
        const rows = database.prepare(
          'SELECT result_summary, task, agent_id FROM claude_sessions WHERE id = ?',
          [options.parentSessionId],
        );
        if (rows.length > 0 && rows[0].result_summary) {
          sections.push([
            '\n---\n',
            '## 前次工作階段摘要',
            '',
            `前一個工作階段（${rows[0].agent_id}）的工作紀錄：`,
            '',
            rows[0].result_summary,
          ].join('\n'));
        }
      } catch (err) {
        logger.warn('Failed to load parent session summary', err);
      }
    }

    // 4. Dependency task outputs (task output chaining)
    if (options?.taskId && options?.projectId) {
      const depContext = this.assembleDependencyContext(options.projectId, options.taskId);
      if (depContext) {
        sections.push(depContext);
      }
    }

    // 5. Agent memory (persistent cross-session context)
    const memoryCtx = this.assembleAgentMemory(agentId, projectId);
    if (memoryCtx) {
      sections.push(memoryCtx);
    }

    // 6. Autonomous delegation — inject colleague list + communication instructions
    const delegationCtx = this.assembleCommunicationContext(agent);
    if (delegationCtx) {
      sections.push(delegationCtx);
    }

    // 7. Agent metadata context — wrapped in <important> for context survival
    const metaLines = [
      `\n---\n`,
      `<important>`,
      `## Agent 資訊`,
      `- **ID**: ${agent.id}`,
      `- **層級**: ${agent.level}`,
      `- **部門**: ${agent.department}`,
    ];

    if (agent.manages.length > 0) {
      metaLines.push(`- **管理**: ${agent.manages.join(', ')}`);
    }
    if (agent.reportsTo) {
      metaLines.push(`- **匯報給**: ${agent.reportsTo}`);
    }

    metaLines.push(`</important>`);
    sections.push(metaLines.join('\n'));

    // 8. Delegation instruction for L1 agents
    if (agent.level === 'L1' && agent.manages.length > 0) {
      sections.push(this.getDelegationInstructions(agent.manages));
    }

    return sections.join('\n');
  }

  /**
   * Preview the assembled prompt (for UI display)
   */
  preview(agentId: string, projectId?: string | null): string {
    try {
      return this.assemble(agentId, projectId);
    } catch {
      return `[無法組裝 Prompt: Agent "${agentId}" 不存在]`;
    }
  }

  private getDelegationInstructions(managedAgents: string[]): string {
    return [
      '\n---\n',
      '## 任務執行方式',
      '',
      '你是 L1，負責讀取開發計畫書並按順序執行任務。',
      '',
      '### 工作流程',
      '1. 讀取 `proposal/sprint*-dev-plan.md` 了解全局',
      '2. 執行 `/task-delegation` 建立 `.tasks/` 任務檔案（系統自動追蹤）',
      '3. 按依賴順序執行任務，可委派給下屬 Agent',
      '4. 每完成一個任務 → 執行 `/task-done`',
      '5. 階段完成 → 執行 `/review` → 提交 `/gate-record`',
      '',
      `### 可委派的下屬 Agent`,
      `${managedAgents.map((a) => `- ${a}`).join('\n')}`,
      '',
      '### 委派方式',
      '直接在任務描述中指明由哪個 Agent 負責，',
      '系統會透過 Session 機制將指令傳達給對應 Agent。',
      '',
      '你也可以記錄工作記憶：',
      '',
      '```ai-studio:memory',
      '你想記住的內容',
      '```',
    ].join('\n');
  }

  /**
   * Assemble additional context for the company-manager agent.
   * Injects a list of known child projects with their workDir paths
   * so the agent can read their .knowledge/ via absolute paths.
   */
  assembleCompanyManagerContext(): string {
    try {
      const projects = database.prepare(
        `SELECT id, name, work_dir FROM projects WHERE work_dir IS NOT NULL AND status IN (?, ?)`,
        ['planning', 'active'],
      );

      if (!projects || projects.length === 0) {
        return [
          '\n---\n',
          '## 已知子專案',
          '',
          '目前沒有已登記工作目錄的子專案。',
        ].join('\n');
      }

      const lines = [
        '\n---\n',
        '## 已知子專案',
        '',
        '以下是目前系統中已知的子專案，可透過絕對路徑讀取其 `.knowledge/` 檔案：',
        '',
      ];

      for (const p of projects as any[]) {
        lines.push(`- **${p.name}** (${p.id})`);
        lines.push(`  - 工作目錄: \`${p.work_dir}\``);
        lines.push(`  - 踩坑紀錄: \`${p.work_dir}/.knowledge/postmortem-log.md\``);
        lines.push(`  - 編碼規範: \`${p.work_dir}/.knowledge/coding-standards.md\``);
        lines.push(`  - 架構文件: \`${p.work_dir}/.knowledge/architecture.md\``);
        lines.push('');
      }

      lines.push('> 注意：只能讀取子專案的 `.knowledge/` 和 `proposal/` 目錄，不得修改子專案的任何檔案。');

      return lines.join('\n');
    } catch (err) {
      logger.warn('Failed to assemble company manager context', err);
      return '';
    }
  }

  /**
   * Inject persistent agent memory (key-value pairs from agent_memory table).
   * Enables CrewAI-style long-term memory across sessions.
   */
  private assembleAgentMemory(agentId: string, projectId?: string | null): string | null {
    try {
      const rows = database.prepare(
        `SELECT key, value, updated_at FROM agent_memory
         WHERE agent_id = ? AND (project_id = ? OR project_id IS NULL)
         ORDER BY updated_at DESC LIMIT 20`,
        [agentId, projectId || null],
      );

      if (!rows || rows.length === 0) return null;

      const lines = [
        '\n---\n',
        '## 工作記憶',
        '',
        '以下是你在先前工作階段中儲存的記憶，供參考：',
        '',
      ];

      for (const r of rows as any[]) {
        lines.push(`- **${r.key}**: ${r.value}`);
      }

      lines.push('');
      lines.push('> 你可以用 `SaveMemory(key, value)` 儲存新記憶，或用 `DeleteMemory(key)` 刪除。');

      return lines.join('\n');
    } catch (err) {
      logger.warn('Failed to assemble agent memory', err);
      return null;
    }
  }

  /**
   * Inject available colleagues and communication instructions.
   * Enables CrewAI-style autonomous delegation via SendMessage tool.
   */
  private assembleCommunicationContext(agent: { id: string; level: string; manages: string[]; reportsTo: string; coordinatesWith?: string[] }): string | null {
    const colleagues: string[] = [];

    if (agent.manages.length > 0) {
      colleagues.push(...agent.manages.map((a) => `${a}（下屬）`));
    }
    if (agent.reportsTo) {
      colleagues.push(`${agent.reportsTo}（上級）`);
    }
    if (agent.coordinatesWith && agent.coordinatesWith.length > 0) {
      colleagues.push(...agent.coordinatesWith.map((a) => `${a}（協作）`));
    }

    if (colleagues.length === 0) return null;

    return [
      '\n---\n',
      '## 跨 Agent 通訊',
      '',
      '你可以主動聯繫以下同事，使用 `SendMessage` 工具：',
      '',
      ...colleagues.map((c) => `- ${c}`),
      '',
      '### 使用方式',
      '```',
      "SendMessage(to: 'agent-id', content: '你的訊息')",
      '```',
      '',
      '### 何時該主動聯繫',
      '- 需要其他專業領域的協助時',
      '- 任務完成後需要通知相關人員時',
      '- 遇到阻塞需要上級決策時',
      '- 需要下屬執行子任務時',
    ].join('\n');
  }

  /**
   * Fetch output summaries from dependency tasks and assemble as context.
   * Enables CrewAI-style task output chaining.
   */
  private assembleDependencyContext(projectId: string, taskId: string): string | null {
    try {
      const deps = database.prepare(
        `SELECT t.id, t.title, t.status, t.output_summary, t.assigned_to
         FROM task_dependencies td
         JOIN tasks t ON t.project_id = td.project_id AND t.id = td.depends_on
         WHERE td.project_id = ? AND td.task_id = ?
         ORDER BY t.completed_at ASC`,
        [projectId, taskId],
      );

      const withOutput = (deps as any[]).filter((d) => d.output_summary);
      if (withOutput.length === 0) return null;

      const lines = [
        '\n---\n',
        '## 前置任務輸出',
        '',
        '以下是你的任務所依賴的前置任務的執行結果，請參考：',
        '',
      ];

      for (const dep of withOutput) {
        lines.push(`### ${dep.id}: ${dep.title}`);
        lines.push(`- 負責人: ${dep.assigned_to || '未指定'}`);
        lines.push(`- 狀態: ${dep.status}`);
        lines.push('');
        lines.push(dep.output_summary);
        lines.push('');
      }

      return lines.join('\n');
    } catch (err) {
      logger.warn('Failed to assemble dependency context', err);
      return null;
    }
  }

  private extractKnowledgeRefs(content: string): string[] {
    const refs: string[] = [];
    const pattern = /(?:company|project):\/\/[\w/.*-]+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      refs.push(match[0]);
    }
    return refs;
  }

  private resolveKnowledgeRefs(refs: string[], projectId?: string | null): string {
    const knowledgeDir = getKnowledgeDir();
    const resolved: string[] = [];

    for (const ref of refs) {
      try {
        let filePath: string;

        let baseDir: string;
        let relPath: string;

        if (ref.startsWith('company://')) {
          baseDir = join(knowledgeDir, 'company');
          relPath = ref.replace('company://', '');
        } else if (ref.startsWith('project://')) {
          if (!projectId) continue;
          baseDir = join(knowledgeDir, 'projects', projectId);
          relPath = ref.replace('project://', '');
        } else {
          continue;
        }

        // Handle glob patterns by just noting the reference
        if (relPath.includes('*')) {
          resolved.push(`> 參考: ${ref}`);
          continue;
        }

        // Security: prevent path traversal
        filePath = safePath(baseDir, relPath) as string;
        if (!filePath) {
          logger.warn(`Blocked path traversal in knowledge ref: ${ref}`);
          continue;
        }

        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          resolved.push(`### ${ref}\n\n${content}`);
        }
      } catch (err) {
        logger.warn(`Failed to resolve knowledge ref: ${ref}`, err);
      }
    }

    return resolved.join('\n\n');
  }
}

export const promptAssembler = new PromptAssembler();

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { database } from './database';

export interface HookLog {
  id: number;
  hook_name: string;
  hook_type: string;
  trigger_time: string;
  trigger_reason: string | null;
  result: 'blocked' | 'passed' | 'warned';
  details: string | null;
  session_id: string | null;
  scope: string;
  project_path: string | null;
  created_at: string;
}

export interface HookListItem {
  name: string;
  source: 'system' | 'user';
  scope: 'global' | 'project';
  projectPath?: string;
  type: string;
  matcher: string;
  enabled: boolean;
}

export interface HookDetail extends HookListItem {
  script: string;
}

export interface ProjectStack {
  testCommand: string;
  lintCommand: string;
  buildCommand?: string;
  typecheckCommand?: string;
}

export interface HookConfig {
  autoInject: boolean;
  stopValidatorEnabled: boolean;
}

class HookManager {
  private templateCache: Map<string, string> = new Map();

  /**
   * 偵測子專案技術棧
   */
  detectProjectStack(workDir: string): ProjectStack {
    // 檢查 package.json
    const pkgPath = join(workDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};
        const tsconfigExists = existsSync(join(workDir, 'tsconfig.json'));
        return {
          testCommand: scripts.test ? 'npm test' : 'echo "no test script"',
          lintCommand: scripts.lint
            ? 'npm run lint'
            : scripts.typecheck
              ? 'npm run typecheck'
              : 'echo "no lint script"',
          buildCommand: scripts.build ? 'npm run build' : undefined,
          typecheckCommand: scripts.typecheck
            ? 'npm run typecheck'
            : tsconfigExists
              ? 'npx tsc --noEmit'
              : undefined,
        };
      } catch { /* ignore parse error */ }
    }

    // 檢查 pyproject.toml
    const pyprojectPath = join(workDir, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      return {
        testCommand: 'pytest',
        lintCommand: 'ruff check .',
      };
    }

    // 檢查 Makefile
    const makefilePath = join(workDir, 'Makefile');
    if (existsSync(makefilePath)) {
      const content = readFileSync(makefilePath, 'utf-8');
      return {
        testCommand: content.includes('test:') ? 'make test' : 'echo "no test target"',
        lintCommand: content.includes('lint:')
          ? 'make lint'
          : content.includes('ci:')
            ? 'make ci'
            : 'echo "no lint target"',
      };
    }

    // 預設
    return {
      testCommand: 'echo "no test configured"',
      lintCommand: 'echo "no lint configured"',
    };
  }

  /**
   * 讀取模板檔案（帶快取）
   */
  private getTemplate(templateName: string): string {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    // 模板路徑：knowledge/company/templates/ 或 app 內建
    const paths = [
      join(process.cwd(), 'knowledge', 'company', 'templates', templateName),
      join(__dirname, '..', '..', 'knowledge', 'company', 'templates', templateName),
    ];

    for (const p of paths) {
      if (existsSync(p)) {
        const content = readFileSync(p, 'utf-8');
        this.templateCache.set(templateName, content);
        return content;
      }
    }

    throw new Error(`Template not found: ${templateName}`);
  }

  /**
   * 計算內容 hash（用於防覆蓋比對）
   */
  private contentHash(content: string): string {
    return createHash('md5').update(content.trim()).digest('hex');
  }

  /**
   * 產生 stop-validator.sh 到子專案 .claude/hooks/
   */
  generateStopValidator(workDir: string): { written: boolean; path: string } {
    const stack = this.detectProjectStack(workDir);
    const template = this.getTemplate('stop-validator.sh.template');

    const projectDir = workDir.replace(/\\/g, '/'); // normalize for bash
    const hash = this.contentHash(template + stack.testCommand + stack.lintCommand);

    const content = template
      .replace(/\{\{PROJECT_DIR\}\}/g, projectDir)
      .replace(/\{\{TEST_COMMAND\}\}/g, stack.testCommand)
      .replace(/\{\{LINT_COMMAND\}\}/g, stack.lintCommand)
      .replace(/\{\{GENERATED_HASH\}\}/g, hash);

    const hooksDir = join(workDir, '.claude', 'hooks');
    const filePath = join(hooksDir, 'stop-validator.sh');

    // 防覆蓋：如果檔案已存在，根據 hash 決定是否覆蓋
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashLine = existing.match(/# Hash: ([a-f0-9]+)/);
      if (hashLine) {
        // 自動產生的檔案 — hash 相同則跳過，不同則安全覆蓋
        if (hashLine[1] === hash) {
          return { written: false, path: filePath };
        }
      } else {
        // 手動建立的檔案 — 不覆蓋
        logger.info(`Hook file exists and was manually created, skipping: ${filePath}`);
        return { written: false, path: filePath };
      }
    }

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
    logger.info(`Stop validator generated: ${filePath}`);
    return { written: true, path: filePath };
  }

  /**
   * 產生 forbidden-commands.sh 到子專案 .claude/hooks/
   */
  generateForbiddenCommandsHook(workDir: string): { written: boolean; path: string } {
    const template = this.getTemplate('forbidden-commands.sh.template');
    const hash = this.contentHash(template);

    const content = template.replace(/\{\{GENERATED_HASH\}\}/g, hash);

    const hooksDir = join(workDir, '.claude', 'hooks');
    const filePath = join(hooksDir, 'forbidden-commands.sh');

    // 防覆蓋：如果檔案已存在，根據 hash 決定是否覆蓋
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashLine = existing.match(/# Hash: ([a-f0-9]+)/);
      if (hashLine) {
        if (hashLine[1] === hash) {
          return { written: false, path: filePath };
        }
      } else {
        logger.info(`Hook file exists and was manually created, skipping: ${filePath}`);
        return { written: false, path: filePath };
      }
    }

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
    logger.info(`Forbidden commands hook generated: ${filePath}`);
    return { written: true, path: filePath };
  }

  /**
   * 產生 g1-design-check.sh 到子專案 .claude/hooks/
   */
  generateG1DesignCheck(workDir: string): { written: boolean; path: string } {
    const template = this.getTemplate('g1-design-check.sh.template');
    const hash = this.contentHash(template);

    const content = template.replace(/\{\{GENERATED_HASH\}\}/g, hash);

    const hooksDir = join(workDir, '.claude', 'hooks');
    const filePath = join(hooksDir, 'g1-design-check.sh');

    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashLine = existing.match(/# Hash: ([a-f0-9]+)/);
      if (hashLine) {
        if (hashLine[1] === hash) {
          return { written: false, path: filePath };
        }
      } else {
        logger.info(`Hook file exists and was manually created, skipping: ${filePath}`);
        return { written: false, path: filePath };
      }
    }

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
    logger.info(`G1 design check hook generated: ${filePath}`);
    return { written: true, path: filePath };
  }

  /**
   * 產生 g4-knowledge-check.sh 到子專案 .claude/hooks/
   */
  generateG4KnowledgeCheck(workDir: string): { written: boolean; path: string } {
    const template = this.getTemplate('g4-knowledge-check.sh.template');
    const hash = this.contentHash(template);

    const content = template.replace(/\{\{GENERATED_HASH\}\}/g, hash);

    const hooksDir = join(workDir, '.claude', 'hooks');
    const filePath = join(hooksDir, 'g4-knowledge-check.sh');

    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashLine = existing.match(/# Hash: ([a-f0-9]+)/);
      if (hashLine) {
        if (hashLine[1] === hash) {
          return { written: false, path: filePath };
        }
      } else {
        logger.info(`Hook file exists and was manually created, skipping: ${filePath}`);
        return { written: false, path: filePath };
      }
    }

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
    logger.info(`G4 knowledge check hook generated: ${filePath}`);
    return { written: true, path: filePath };
  }

  /**
   * 產生 g5-pre-deploy.sh 到子專案 .claude/hooks/
   */
  generateG5PreDeployCheck(workDir: string): { written: boolean; path: string } {
    const stack = this.detectProjectStack(workDir);
    const template = this.getTemplate('g5-pre-deploy.sh.template');

    const projectDir = workDir.replace(/\\/g, '/');
    const typecheckCommand = stack.typecheckCommand ?? 'echo "no typecheck configured"';
    const buildCommand = stack.buildCommand ?? 'echo "no build configured"';
    const hash = this.contentHash(template + typecheckCommand + buildCommand);

    const content = template
      .replace(/\{\{PROJECT_DIR\}\}/g, projectDir)
      .replace(/\{\{TYPECHECK_COMMAND\}\}/g, typecheckCommand)
      .replace(/\{\{BUILD_COMMAND\}\}/g, buildCommand)
      .replace(/\{\{GENERATED_HASH\}\}/g, hash);

    const hooksDir = join(workDir, '.claude', 'hooks');
    const filePath = join(hooksDir, 'g5-pre-deploy.sh');

    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashLine = existing.match(/# Hash: ([a-f0-9]+)/);
      if (hashLine) {
        if (hashLine[1] === hash) {
          return { written: false, path: filePath };
        }
      } else {
        logger.info(`Hook file exists and was manually created, skipping: ${filePath}`);
        return { written: false, path: filePath };
      }
    }

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
    logger.info(`G5 pre-deploy check hook generated: ${filePath}`);
    return { written: true, path: filePath };
  }

  /**
   * 寫入子專案 .claude/settings.json 的 hooks 區段
   */
  writeHookSettings(workDir: string): { written: boolean; path: string } {
    const settingsDir = join(workDir, '.claude');
    const settingsPath = join(settingsDir, 'settings.json');

    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }

    // 讀取現有 settings
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch {
        logger.warn(`Failed to parse existing settings.json: ${settingsPath}`);
      }
    }

    // 如果 PreToolUse、PostToolUse 和 Stop 都已存在，不覆蓋
    const existingHooks = settings.hooks as Record<string, unknown> | undefined;
    if (existingHooks?.Stop && existingHooks?.PreToolUse && existingHooks?.PostToolUse) {
      logger.info(`hooks already configured in ${settingsPath}, skipping`);
      return { written: false, path: settingsPath };
    }

    const hookConfig: Record<string, unknown[]> = {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/forbidden-commands.sh',
            },
            {
              type: 'command',
              command: 'bash .claude/hooks/g5-pre-deploy.sh',
            },
          ],
        },
        {
          matcher: 'Edit',
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/g1-design-check.sh',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit',
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/g4-knowledge-check.sh',
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/stop-validator.sh',
              timeout: 120,
            },
          ],
        },
      ],
    };

    // 合併寫入（保留已有的 hook，只補缺少的）
    const mergedHooks: Record<string, unknown> = { ...(existingHooks || {}) };
    if (!mergedHooks.PreToolUse) {
      mergedHooks.PreToolUse = hookConfig.PreToolUse;
    }
    if (!mergedHooks.PostToolUse) {
      mergedHooks.PostToolUse = hookConfig.PostToolUse;
    }
    if (!mergedHooks.Stop) {
      mergedHooks.Stop = hookConfig.Stop;
    }
    settings.hooks = mergedHooks;

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    logger.info(`Hook settings written: ${settingsPath}`);
    return { written: true, path: settingsPath };
  }

  /**
   * 取得子專案的 Hook 配置狀態
   */
  getHookConfig(workDir: string): HookConfig & { stack: ProjectStack } {
    const stack = this.detectProjectStack(workDir);
    const settingsPath = join(workDir, '.claude', 'settings.json');

    let stopValidatorEnabled = false;
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        stopValidatorEnabled = !!(settings.hooks?.Stop);
      } catch { /* ignore */ }
    }

    return {
      autoInject: true, // 預設開啟
      stopValidatorEnabled,
      stack,
    };
  }

  /**
   * 讀取 settings.json 的原始內容，回傳 parsed object 或 {}
   */
  private readSettings(workDir: string): Record<string, unknown> {
    const settingsPath = join(workDir, '.claude', 'settings.json');
    if (!existsSync(settingsPath)) return {};
    try {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      logger.warn(`Failed to parse settings.json: ${settingsPath}`);
      return {};
    }
  }

  /**
   * 寫入 settings.json（原子性合併）
   */
  private saveSettings(workDir: string, settings: Record<string, unknown>): void {
    const settingsDir = join(workDir, '.claude');
    const settingsPath = join(settingsDir, 'settings.json');
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /**
   * 從 command 字串提取 hook name
   * e.g. "bash .claude/hooks/forbidden-commands.sh" → "forbidden-commands"
   */
  private extractNameFromCommand(command: string): string {
    const match = command.match(/\.claude\/hooks\/([^.]+)\.sh/);
    return match ? match[1] : basename(command);
  }

  /**
   * 列出所有已設定的 hook（支援 global + project 雙範疇）
   * - 永遠掃描 AgentHub 自身 .claude/settings.json（scope=global）
   * - 若提供 projectPath，也掃描該路徑（scope=project）
   */
  listHooks(projectPath?: string): HookListItem[] {
    const globalDir = process.cwd();
    const systemNames = new Set(['stop-validator', 'forbidden-commands', 'g1-design-check', 'g4-knowledge-check', 'g5-pre-deploy']);
    const items: HookListItem[] = [];

    const scanSettings = (workDir: string, scope: 'global' | 'project'): void => {
      const settings = this.readSettings(workDir);
      const hooks = settings.hooks as Record<string, unknown[]> | undefined;
      if (!hooks) return;

      for (const [eventType, entries] of Object.entries(hooks)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const entryObj = entry as Record<string, unknown>;
          const matcher = typeof entryObj.matcher === 'string' ? entryObj.matcher : '';
          const entryHooks = Array.isArray(entryObj.hooks) ? entryObj.hooks as Array<Record<string, unknown>> : [];
          for (const h of entryHooks) {
            if (typeof h.command !== 'string') continue;
            const name = this.extractNameFromCommand(h.command);
            const item: HookListItem = {
              name,
              source: systemNames.has(name) ? 'system' : 'user',
              scope,
              type: eventType,
              matcher,
              enabled: true,
            };
            if (scope === 'project') {
              item.projectPath = workDir;
            }
            items.push(item);
          }
        }
      }
    };

    scanSettings(globalDir, 'global');

    if (projectPath) {
      // Scan specific project
      if (projectPath !== globalDir) {
        scanSettings(projectPath, 'project');
      }
    } else {
      // Scan all projects from DB (same pattern as skillManager.list)
      const projectRows = database.prepare(
        'SELECT work_dir FROM projects WHERE work_dir IS NOT NULL',
      );
      for (const row of projectRows) {
        const workDir = (row as { work_dir: string | null }).work_dir;
        if (workDir && workDir !== globalDir) {
          scanSettings(workDir, 'project');
        }
      }
    }

    return items;
  }

  /**
   * 取得單一 hook 的完整詳情（含 script 內容）
   * - scope=global（或未指定）：從 AgentHub 自身 .claude/hooks/ 讀取
   * - scope=project：從 {projectPath}/.claude/hooks/ 讀取
   */
  getHook(name: string, scope?: string, projectPath?: string): HookDetail {
    const workDir = (scope === 'project' && projectPath) ? projectPath : process.cwd();
    const list = this.listHooks(scope === 'project' ? projectPath : undefined);
    const item = list.find((h) => h.name === name && h.scope === (scope === 'project' ? 'project' : 'global'));
    if (!item) {
      throw new Error(`Hook not found: ${name}`);
    }

    const scriptPath = join(workDir, '.claude', 'hooks', `${name}.sh`);
    let script = '';
    if (existsSync(scriptPath)) {
      script = readFileSync(scriptPath, 'utf-8');
    }

    return { ...item, script };
  }

  /**
   * 建立新的 user hook（支援 scope）
   * - scope=global（或未指定）：寫入 AgentHub 自身 .claude/
   * - scope=project：寫入 {projectPath}/.claude/
   */
  createHook(params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }): void {
    const { name, type, matcher, script, scope, projectPath } = params;
    const workDir = (scope === 'project' && projectPath) ? projectPath : process.cwd();

    // 1. 寫 script 檔
    const hooksDir = join(workDir, '.claude', 'hooks');
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }
    writeFileSync(join(hooksDir, `${name}.sh`), script, 'utf-8');

    // 2. 更新 settings.json
    const settings = this.readSettings(workDir);
    const hooks = (settings.hooks as Record<string, unknown[]>) || {};

    const newEntry: Record<string, unknown> = {
      hooks: [{ type: 'command', command: `bash .claude/hooks/${name}.sh` }],
    };
    if (matcher) newEntry.matcher = matcher;

    if (!Array.isArray(hooks[type])) {
      hooks[type] = [];
    }
    hooks[type] = [...hooks[type], newEntry];
    settings.hooks = hooks;
    this.saveSettings(workDir, settings);
    logger.info(`Hook created: ${name} (${type}) [${scope ?? 'global'}]`);
  }

  /**
   * 更新現有 hook 的 script 及 matcher/type（支援 scope）
   */
  updateHook(params: { name: string; type: string; matcher: string; script: string; scope?: string; projectPath?: string }): void {
    const { name, type, matcher, script, scope, projectPath } = params;
    const workDir = (scope === 'project' && projectPath) ? projectPath : process.cwd();

    // 1. 覆寫 script 檔
    const scriptPath = join(workDir, '.claude', 'hooks', `${name}.sh`);
    writeFileSync(scriptPath, script, 'utf-8');

    // 2. 在 settings.json 中找到舊 entry 並更新
    const settings = this.readSettings(workDir);
    const hooks = (settings.hooks as Record<string, unknown[]>) || {};
    const command = `bash .claude/hooks/${name}.sh`;

    // 移除所有 event type 中包含此 command 的 entry
    for (const eventType of Object.keys(hooks)) {
      if (!Array.isArray(hooks[eventType])) continue;
      hooks[eventType] = hooks[eventType].filter((entry) => {
        const e = entry as Record<string, unknown>;
        const entryHooks = Array.isArray(e.hooks) ? e.hooks as Array<Record<string, unknown>> : [];
        return !entryHooks.some((h) => h.command === command);
      });
      if (hooks[eventType].length === 0) delete hooks[eventType];
    }

    // 新增到目標 type
    const newEntry: Record<string, unknown> = {
      hooks: [{ type: 'command', command }],
    };
    if (matcher) newEntry.matcher = matcher;

    if (!Array.isArray(hooks[type])) {
      hooks[type] = [];
    }
    hooks[type] = [...hooks[type], newEntry];
    settings.hooks = hooks;
    this.saveSettings(workDir, settings);
    logger.info(`Hook updated: ${name} (${type}) [${scope ?? 'global'}]`);
  }

  /**
   * 刪除 user hook（system hook 拒絕刪除，支援 scope）
   */
  deleteHook(name: string, scope?: string, projectPath?: string): void {
    const systemNames = new Set(['stop-validator', 'forbidden-commands', 'g1-design-check', 'g4-knowledge-check', 'g5-pre-deploy']);
    if (systemNames.has(name)) {
      throw new Error(`Cannot delete system hook: ${name}`);
    }

    const workDir = (scope === 'project' && projectPath) ? projectPath : process.cwd();

    // 1. 刪除 .sh 檔
    const scriptPath = join(workDir, '.claude', 'hooks', `${name}.sh`);
    if (existsSync(scriptPath)) {
      unlinkSync(scriptPath);
    }

    // 2. 從 settings.json 移除 entry
    const settings = this.readSettings(workDir);
    const hooks = (settings.hooks as Record<string, unknown[]>) || {};
    const command = `bash .claude/hooks/${name}.sh`;

    for (const eventType of Object.keys(hooks)) {
      if (!Array.isArray(hooks[eventType])) continue;
      hooks[eventType] = hooks[eventType].filter((entry) => {
        const e = entry as Record<string, unknown>;
        const entryHooks = Array.isArray(e.hooks) ? e.hooks as Array<Record<string, unknown>> : [];
        return !entryHooks.some((h) => h.command === command);
      });
      if (hooks[eventType].length === 0) delete hooks[eventType];
    }

    settings.hooks = hooks;
    this.saveSettings(workDir, settings);
    logger.info(`Hook deleted: ${name} [${scope ?? 'global'}]`);
  }

  /**
   * @deprecated Hook toggle 已棄用 — 所有 Hook 永遠啟用。
   * 保留方法簽名以避免 IPC 斷裂，但不做任何操作。
   */
  toggleHook(_name: string, _enabled: boolean, _scope?: string, _projectPath?: string): void {
    logger.info('HookManager: toggleHook is deprecated — all hooks are always enabled');
  }

  /**
   * Record a hook trigger event in the database
   */
  logHookTrigger(params: {
    hookName: string;
    hookType: string;
    triggerReason?: string;
    result: 'blocked' | 'passed' | 'warned';
    details?: string;
    sessionId?: string;
    scope?: string;
    projectPath?: string;
  }): void {
    database.run(
      `INSERT INTO hook_logs (hook_name, hook_type, trigger_time, trigger_reason, result, details, session_id, scope, project_path)
       VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)`,
      [
        params.hookName,
        params.hookType,
        params.triggerReason || null,
        params.result,
        params.details || null,
        params.sessionId || null,
        params.scope ?? 'global',
        params.projectPath || null,
      ],
    );
  }

  /**
   * Query hook logs with optional filters
   */
  queryHookLogs(filters?: { hookName?: string; result?: string; limit?: number; offset?: number; projectPath?: string }): HookLog[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.hookName) {
      conditions.push('hook_name = ?');
      values.push(filters.hookName);
    }
    if (filters?.result) {
      conditions.push('result = ?');
      values.push(filters.result);
    }
    if (filters?.projectPath) {
      conditions.push('project_path = ?');
      values.push(filters.projectPath);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;

    return database.prepare(
      `SELECT id, hook_name, hook_type, trigger_time, trigger_reason, result, details, session_id, scope, project_path, created_at FROM hook_logs ${where} ORDER BY trigger_time DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    ) as HookLog[];
  }

  /**
   * Get aggregated hook stats
   */
  getHookStats(projectPath?: string): { total: number; blocked: number; passed: number; warned: number } {
    const where = projectPath ? 'WHERE project_path = ?' : '';
    const values = projectPath ? [projectPath] : [];
    const rows = database.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN result = 'blocked' THEN 1 ELSE 0 END) AS blocked,
         SUM(CASE WHEN result = 'passed'  THEN 1 ELSE 0 END) AS passed,
         SUM(CASE WHEN result = 'warned'  THEN 1 ELSE 0 END) AS warned
       FROM hook_logs ${where}`,
      values,
    );
    const row = rows[0] as { total: number; blocked: number; passed: number; warned: number } | undefined;
    return {
      total:   Number(row?.total   ?? 0),
      blocked: Number(row?.blocked ?? 0),
      passed:  Number(row?.passed  ?? 0),
      warned:  Number(row?.warned  ?? 0),
    };
  }

  /**
   * 完整注入流程：spawn session 時呼叫
   */
  tryInjectHooks(workDir: string): void {
    try {
      // 1. 產生 stop-validator.sh
      const validatorResult = this.generateStopValidator(workDir);
      if (validatorResult.written) {
        logger.info(`Hook injected: stop-validator.sh → ${workDir}`);
      }

      // 2. 產生 forbidden-commands.sh
      const forbiddenResult = this.generateForbiddenCommandsHook(workDir);
      if (forbiddenResult.written) {
        logger.info(`Hook injected: forbidden-commands.sh → ${workDir}`);
      }

      // 3. 寫入 settings.json hooks 區段
      const settingsResult = this.writeHookSettings(workDir);
      if (settingsResult.written) {
        logger.info(`Hook settings injected → ${workDir}`);
      }

      // 4. 產生 g1-design-check.sh
      const g1Result = this.generateG1DesignCheck(workDir);
      if (g1Result.written) {
        logger.info(`Hook injected: g1-design-check.sh → ${workDir}`);
      }

      // 5. 產生 g4-knowledge-check.sh
      const g4Result = this.generateG4KnowledgeCheck(workDir);
      if (g4Result.written) {
        logger.info(`Hook injected: g4-knowledge-check.sh → ${workDir}`);
      }

      // 6. 產生 g5-pre-deploy.sh
      const g5Result = this.generateG5PreDeployCheck(workDir);
      if (g5Result.written) {
        logger.info(`Hook injected: g5-pre-deploy.sh → ${workDir}`);
      }
    } catch (err) {
      // Hook 注入失敗不應阻斷 session spawn
      logger.warn(`Hook injection failed for ${workDir}: ${err}`);
    }
  }
}

export const hookManager = new HookManager();

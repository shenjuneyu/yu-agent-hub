// @vitest-environment node

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockStatSync = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
    statSync: (...args: unknown[]) => mockStatSync(...args),
  };
});

vi.mock('../../electron/services/database', () => ({
  database: {
    run: vi.fn(),
    prepare: vi.fn(() => []),
    get: vi.fn(),
  },
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { hookManager } from '../../electron/services/hook-manager';
import { database } from '../../electron/services/database';

const mockDb = database as { run: ReturnType<typeof vi.fn>; prepare: ReturnType<typeof vi.fn> };

describe('HookManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
    mockDb.prepare.mockReturnValue([]);
  });

  // ── detectProjectStack ──────────────────────────────────────────────────

  describe('detectProjectStack', () => {
    it('returns npm commands when package.json has test and lint scripts', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('package.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ scripts: { test: 'jest', lint: 'eslint .', build: 'tsc' } }),
      );

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.testCommand).toBe('npm test');
      expect(stack.lintCommand).toBe('npm run lint');
      expect(stack.buildCommand).toBe('npm run build');
    });

    it('falls back to typecheck as lintCommand when no lint script', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('package.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ scripts: { test: 'vitest', typecheck: 'tsc --noEmit' } }),
      );

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.lintCommand).toBe('npm run typecheck');
      expect(stack.typecheckCommand).toBe('npm run typecheck');
    });

    it('uses npx tsc when no typecheck script but tsconfig.json exists', () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const s = String(p);
        return s.endsWith('package.json') || s.endsWith('tsconfig.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({ scripts: { test: 'jest' } }));

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.typecheckCommand).toBe('npx tsc --noEmit');
    });

    it('returns echo fallbacks when package.json has no scripts', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('package.json'));
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.testCommand).toBe('echo "no test script"');
      expect(stack.lintCommand).toBe('echo "no lint script"');
    });

    it('returns pytest/ruff for Python projects with pyproject.toml', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('pyproject.toml'));

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.testCommand).toBe('pytest');
      expect(stack.lintCommand).toBe('ruff check .');
    });

    it('returns make commands for Makefile projects with test: and lint: targets', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('Makefile'));
      mockReadFileSync.mockReturnValue('test:\n\tgo test\nlint:\n\tgolint\n');

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.testCommand).toBe('make test');
      expect(stack.lintCommand).toBe('make lint');
    });

    it('returns make ci as lintCommand when Makefile has ci: but no lint:', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('Makefile'));
      mockReadFileSync.mockReturnValue('test:\n\tgo test\nci:\n\t./ci.sh\n');

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.lintCommand).toBe('make ci');
    });

    it('returns default echo messages when no project files found', () => {
      mockExistsSync.mockReturnValue(false);

      const stack = hookManager.detectProjectStack('/empty-project');

      expect(stack.testCommand).toBe('echo "no test configured"');
      expect(stack.lintCommand).toBe('echo "no lint configured"');
    });

    it('ignores malformed package.json and falls through to defaults', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('package.json'));
      mockReadFileSync.mockReturnValue('{ invalid json :::');

      const stack = hookManager.detectProjectStack('/project');

      expect(stack.testCommand).toBe('echo "no test configured"');
    });
  });

  // ── listHooks ───────────────────────────────────────────────────────────

  describe('listHooks', () => {
    it('returns empty array when no settings.json files exist', () => {
      mockExistsSync.mockReturnValue(false);

      const items = hookManager.listHooks();

      expect(items).toEqual([]);
    });

    it('parses hooks from global settings.json and marks system hooks', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [{ type: 'command', command: 'bash .claude/hooks/stop-validator.sh' }],
              },
            ],
          },
        }),
      );

      const items = hookManager.listHooks();

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('stop-validator');
      expect(items[0].source).toBe('system');
      expect(items[0].scope).toBe('global');
      expect(items[0].type).toBe('Stop');
      expect(items[0].enabled).toBe(true);
    });

    it('marks unknown hook names as user source', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'bash .claude/hooks/my-custom-hook.sh' }],
              },
            ],
          },
        }),
      );

      const items = hookManager.listHooks();

      expect(items[0].name).toBe('my-custom-hook');
      expect(items[0].source).toBe('user');
      expect(items[0].matcher).toBe('Bash');
    });

    it('scans project path and tags items with scope=project', () => {
      const projectPath = '/project/my-app';
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json'));
      mockReadFileSync.mockImplementation((p: unknown) => {
        const normalized = String(p).replace(/\\/g, '/');
        if (normalized.includes('my-app')) {
          return JSON.stringify({
            hooks: {
              Stop: [
                {
                  hooks: [{ type: 'command', command: 'bash .claude/hooks/stop-validator.sh' }],
                },
              ],
            },
          });
        }
        // global settings.json — return empty hooks so no global items added
        return JSON.stringify({});
      });

      const items = hookManager.listHooks(projectPath);

      const projectItems = items.filter((i) => i.scope === 'project');
      expect(projectItems).toHaveLength(1);
      expect(projectItems[0].projectPath).toBe(projectPath);
    });

    it('skips entries whose hook commands are not strings', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [{ hooks: [{ type: 'command', command: 42 }] }],
          },
        }),
      );

      const items = hookManager.listHooks();

      expect(items).toHaveLength(0);
    });
  });

  // ── getHook ─────────────────────────────────────────────────────────────

  describe('getHook', () => {
    it('returns hook detail with script content when hook exists', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json') || String(p).endsWith('.sh'));
      mockReadFileSync.mockImplementation((p: unknown) => {
        if (String(p).endsWith('settings.json')) {
          return JSON.stringify({
            hooks: {
              Stop: [
                {
                  hooks: [{ type: 'command', command: 'bash .claude/hooks/stop-validator.sh' }],
                },
              ],
            },
          });
        }
        return '#!/bin/bash\necho "stop"';
      });

      const detail = hookManager.getHook('stop-validator', 'global');

      expect(detail.name).toBe('stop-validator');
      expect(detail.script).toBe('#!/bin/bash\necho "stop"');
    });

    it('throws when the hook name is not found in settings', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json'));
      mockReadFileSync.mockReturnValue(JSON.stringify({ hooks: {} }));

      expect(() => hookManager.getHook('nonexistent', 'global')).toThrow('Hook not found: nonexistent');
    });

    it('returns empty script when .sh file does not exist', () => {
      // settings.json has the hook, but the .sh file is missing
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('settings.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [{ type: 'command', command: 'bash .claude/hooks/stop-validator.sh' }],
              },
            ],
          },
        }),
      );

      const detail = hookManager.getHook('stop-validator', 'global');

      expect(detail.script).toBe('');
    });
  });

  // ── writeHookSettings ───────────────────────────────────────────────────

  describe('writeHookSettings', () => {
    it('writes settings.json with hook config when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = hookManager.writeHookSettings('/project');

      expect(result.written).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.hooks.Stop).toBeDefined();
      expect(written.hooks.PreToolUse).toBeDefined();
      expect(written.hooks.PostToolUse).toBeDefined();
    });

    it('skips writing when all three hook sections already exist', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [{}],
            PreToolUse: [{}],
            PostToolUse: [{}],
          },
        }),
      );

      const result = hookManager.writeHookSettings('/project');

      expect(result.written).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('merges missing sections into existing partial hook config', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [{}],
          },
        }),
      );

      const result = hookManager.writeHookSettings('/project');

      expect(result.written).toBe(true);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      // Stop should be preserved from the original; PreToolUse/PostToolUse should be added
      expect(written.hooks.Stop).toEqual([{}]);
      expect(written.hooks.PreToolUse).toBeDefined();
      expect(written.hooks.PostToolUse).toBeDefined();
    });
  });

  // ── deleteHook ──────────────────────────────────────────────────────────

  describe('deleteHook', () => {
    it('throws when attempting to delete a system hook', () => {
      expect(() => hookManager.deleteHook('stop-validator')).toThrow(
        'Cannot delete system hook: stop-validator',
      );
      expect(() => hookManager.deleteHook('forbidden-commands')).toThrow(
        'Cannot delete system hook: forbidden-commands',
      );
    });

    it('removes .sh file and strips entry from settings.json', () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const s = String(p);
        return s.endsWith('my-hook.sh') || s.endsWith('settings.json');
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'bash .claude/hooks/my-hook.sh' }],
              },
            ],
          },
        }),
      );

      hookManager.deleteHook('my-hook', 'global');

      expect(mockUnlinkSync).toHaveBeenCalledOnce();
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      // The PreToolUse array should now be empty and the key removed
      expect(written.hooks.PreToolUse).toBeUndefined();
    });

    it('does not throw if .sh file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      expect(() => hookManager.deleteHook('my-custom-hook', 'global')).not.toThrow();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });

  // ── logHookTrigger ──────────────────────────────────────────────────────

  describe('logHookTrigger', () => {
    it('inserts a hook log record into the database', () => {
      hookManager.logHookTrigger({
        hookName: 'stop-validator',
        hookType: 'Stop',
        result: 'passed',
        scope: 'project',
        projectPath: '/project',
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hook_logs'),
        expect.arrayContaining(['stop-validator', 'Stop', 'passed', 'project', '/project']),
      );
    });

    it('uses global as default scope when not provided', () => {
      hookManager.logHookTrigger({
        hookName: 'forbidden-commands',
        hookType: 'PreToolUse',
        result: 'blocked',
      });

      const args = mockDb.run.mock.calls[0][1] as unknown[];
      expect(args).toContain('global');
    });
  });

  // ── getHookConfig ───────────────────────────────────────────────────────

  describe('getHookConfig', () => {
    it('returns stopValidatorEnabled=true when settings.json has Stop hook', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ hooks: { Stop: [{ hooks: [] }] } }),
      );

      const config = hookManager.getHookConfig('/project');

      expect(config.stopValidatorEnabled).toBe(true);
      expect(config.autoInject).toBe(true);
    });

    it('returns stopValidatorEnabled=false when settings.json has no Stop hook', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ hooks: {} }));

      const config = hookManager.getHookConfig('/project');

      expect(config.stopValidatorEnabled).toBe(false);
    });

    it('returns stopValidatorEnabled=false when settings.json does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const config = hookManager.getHookConfig('/project');

      expect(config.stopValidatorEnabled).toBe(false);
    });

    it('includes detected stack in the returned config', () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('package.json'));
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ scripts: { test: 'jest', lint: 'eslint .' } }),
      );

      const config = hookManager.getHookConfig('/project');

      expect(config.stack.testCommand).toBe('npm test');
      expect(config.stack.lintCommand).toBe('npm run lint');
    });
  });

  // ── toggleHook (deprecated) ─────────────────────────────────────────────

  describe('toggleHook', () => {
    it('does not throw and performs no writes (deprecated no-op)', () => {
      expect(() => hookManager.toggleHook('stop-validator', false)).not.toThrow();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });
});

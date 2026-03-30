// @vitest-environment node

import * as chokidar from 'chokidar';
import * as fs from 'fs';

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    readdirSync: vi.fn(() => []),
  };
});

vi.mock('../../electron/services/database', () => ({
  database: {
    run: vi.fn(),
    prepare: vi.fn(() => []),
    get: vi.fn(),
  },
}));

vi.mock('../../electron/services/event-bus', () => ({
  eventBus: {
    emitFileSynced: vi.fn(),
  },
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../electron/services/markdown-parser', () => ({
  parseTaskFile: vi.fn(),
  parseDevPlanSection10: vi.fn(() => ({ gateRecords: [] })),
  parseConfirmedFlow: vi.fn(() => []),
}));

import { projectSync } from '../../electron/services/project-sync';
import { database } from '../../electron/services/database';
import { eventBus } from '../../electron/services/event-bus';
import { parseTaskFile, parseDevPlanSection10, parseConfirmedFlow } from '../../electron/services/markdown-parser';

const mockChokidar = chokidar as { watch: ReturnType<typeof vi.fn> };
const mockFs = fs as {
  existsSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  readdirSync: ReturnType<typeof vi.fn>;
};
const mockDb = database as {
  run: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};
const mockEventBus = eventBus as { emitFileSynced: ReturnType<typeof vi.fn> };
const mockParseTaskFile = parseTaskFile as ReturnType<typeof vi.fn>;
const mockParseDevPlanSection10 = parseDevPlanSection10 as ReturnType<typeof vi.fn>;
const mockParseConfirmedFlow = parseConfirmedFlow as ReturnType<typeof vi.fn>;

// Helper: create a minimal ParsedTask
const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'T1',
  title: 'Test Task',
  status: 'created',
  assignedTo: null,
  priority: 'medium',
  sprintId: null,
  projectId: null,
  tags: null,
  estimatedHours: null,
  createdAt: null,
  description: '',
  dependsOn: null,
  ...overrides,
});

// Helper: build a fake dirent-like object for readdirSync({ withFileTypes: true })
function makeDirent(name: string, isFile: boolean) {
  return { name, isFile: () => isFile, isDirectory: () => !isFile };
}

describe('ProjectSyncService', () => {
  // Each test gets a fresh projectSync state — but because it's a singleton we must
  // ensure watchers are cleaned up between tests.
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return values
    mockParseDevPlanSection10.mockReturnValue({ gateRecords: [] });
    mockParseConfirmedFlow.mockReturnValue([]);
    mockDb.prepare.mockReturnValue([]);
    // Stop any watchers left over from a previous test
    projectSync.stopAll();
  });

  // ---------------------------------------------------------------------------
  // startWatch
  // ---------------------------------------------------------------------------

  describe('startWatch', () => {
    it('creates a chokidar watcher for a new project', () => {
      projectSync.startWatch('proj-1', '/work/proj');

      expect(mockChokidar.watch).toHaveBeenCalledOnce();
      expect(mockChokidar.watch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('.tasks'),
          expect.stringContaining('proposal'),
        ]),
        expect.objectContaining({ ignoreInitial: true }),
      );
    });

    it('registers add, change, ready, and error event handlers on the watcher', () => {
      const mockWatcher = { on: vi.fn().mockReturnThis(), close: vi.fn().mockResolvedValue(undefined) };
      mockChokidar.watch.mockReturnValueOnce(mockWatcher);

      projectSync.startWatch('proj-2', '/work/proj2');

      const registeredEvents = mockWatcher.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(registeredEvents).toContain('ready');
      expect(registeredEvents).toContain('add');
      expect(registeredEvents).toContain('change');
      expect(registeredEvents).toContain('error');
    });

    it('skips creating a watcher when the project is already being watched', () => {
      projectSync.startWatch('proj-dup', '/work/proj');
      projectSync.startWatch('proj-dup', '/work/proj');

      // chokidar.watch is called once during beforeEach teardown (stopAll) is a no-op
      // so we expect exactly one call for the two startWatch calls on same project
      expect(mockChokidar.watch).toHaveBeenCalledOnce();
    });

    it('uses forward-slash paths so chokidar works on Windows', () => {
      projectSync.startWatch('proj-win', 'C:\\work\\my-proj');

      const [paths] = mockChokidar.watch.mock.calls[0] as [string[], unknown];
      for (const p of paths) {
        expect(p).not.toContain('\\');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // stopWatch
  // ---------------------------------------------------------------------------

  describe('stopWatch', () => {
    it('calls close() on the watcher and removes it from the registry', () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockWatcher = { on: vi.fn().mockReturnThis(), close: mockClose };
      mockChokidar.watch.mockReturnValueOnce(mockWatcher);

      projectSync.startWatch('proj-stop', '/work/proj');
      projectSync.stopWatch('proj-stop');

      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('does nothing when the project is not being watched', () => {
      // Should not throw
      expect(() => projectSync.stopWatch('nonexistent-proj')).not.toThrow();
    });

    it('does not close watcher for a different project', () => {
      const closeA = vi.fn().mockResolvedValue(undefined);
      const watcherA = { on: vi.fn().mockReturnThis(), close: closeA };
      mockChokidar.watch.mockReturnValueOnce(watcherA);

      projectSync.startWatch('proj-a', '/work/a');
      projectSync.stopWatch('proj-b'); // different id

      expect(closeA).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // stopAll
  // ---------------------------------------------------------------------------

  describe('stopAll', () => {
    it('closes all active watchers', () => {
      const closeX = vi.fn().mockResolvedValue(undefined);
      const closeY = vi.fn().mockResolvedValue(undefined);
      mockChokidar.watch
        .mockReturnValueOnce({ on: vi.fn().mockReturnThis(), close: closeX })
        .mockReturnValueOnce({ on: vi.fn().mockReturnThis(), close: closeY });

      projectSync.startWatch('proj-x', '/work/x');
      projectSync.startWatch('proj-y', '/work/y');
      projectSync.stopAll();

      expect(closeX).toHaveBeenCalledOnce();
      expect(closeY).toHaveBeenCalledOnce();
    });

    it('does not throw when there are no active watchers', () => {
      expect(() => projectSync.stopAll()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // markWritten
  // ---------------------------------------------------------------------------

  describe('markWritten', () => {
    it('stores the file path so subsequent calls do not throw', () => {
      // markWritten is a void method — the public contract is "does not throw"
      // and the side effect is tested indirectly via handleFileChange self-write guard.
      expect(() => projectSync.markWritten('/some/file.md')).not.toThrow();
    });

    it('accepts multiple distinct file paths without error', () => {
      expect(() => {
        projectSync.markWritten('/path/to/file-a.md');
        projectSync.markWritten('/path/to/file-b.md');
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // fullSync — directory-does-not-exist
  // ---------------------------------------------------------------------------

  describe('fullSync — directories do not exist', () => {
    it('returns zeroed counts and empty errors when neither .tasks nor proposal exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result).toEqual({ tasksUpdated: 0, gatesUpdated: 0, errors: [] });
    });

    it('always emits fileSynced even when directories are missing', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await projectSync.fullSync('proj-1', '/work/proj');

      expect(mockEventBus.emitFileSynced).toHaveBeenCalledWith({ projectId: 'proj-1', type: 'full' });
    });
  });

  // ---------------------------------------------------------------------------
  // fullSync — .tasks directory
  // ---------------------------------------------------------------------------

  describe('fullSync — .tasks directory', () => {
    it('reads the .tasks directory and upserts each parsed task file', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('.tasks'));
      mockFs.readdirSync.mockReturnValue([makeDirent('T1-foo.md', true)]);
      mockFs.readFileSync.mockReturnValue('# task content');
      mockParseTaskFile.mockReturnValue(makeTask());
      // DB: resolveSprintId needs prepare to return [] (no sprint found → auto-create)
      mockDb.prepare.mockReturnValue([]);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.tasksUpdated).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasks'),
        expect.arrayContaining(['proj-1', 'Test Task']),
      );
    });

    it('skips non-.md files in the .tasks directory', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('.tasks'));
      // Mix of md and non-md files — only the dirent with isFile() and .md should be processed
      mockFs.readdirSync.mockReturnValue([
        makeDirent('T1-foo.md', true),
        makeDirent('README.txt', true),
        makeDirent('image.png', true),
      ]);
      mockFs.readFileSync.mockReturnValue('# task content');
      mockParseTaskFile.mockReturnValue(makeTask());
      mockDb.prepare.mockReturnValue([]);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      // Only the .md file should be processed
      expect(result.tasksUpdated).toBe(1);
    });

    it('does not increment tasksUpdated when parseTaskFile returns null', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('.tasks'));
      mockFs.readdirSync.mockReturnValue([makeDirent('T1-unparseable.md', true)]);
      mockFs.readFileSync.mockReturnValue('');
      mockParseTaskFile.mockReturnValue(null);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.tasksUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('collects an error entry when readFileSync throws for a task file', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('.tasks'));
      mockFs.readdirSync.mockReturnValue([makeDirent('T1-bad.md', true)]);
      mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('T1-bad.md');
    });
  });

  // ---------------------------------------------------------------------------
  // fullSync — sprint subfolders
  // ---------------------------------------------------------------------------

  describe('fullSync — sprint subfolders in .tasks', () => {
    it('reads task files from sprint subfolders and prefixes the id', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('.tasks'));
      // Top-level entry is a directory (sprint-1), no flat files
      mockFs.readdirSync.mockImplementation((dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('.tasks')) {
          return [makeDirent('sprint-1', false)]; // directory
        }
        if (p.endsWith('sprint-1')) {
          return ['T2-bar.md']; // plain strings — matches filter(f => f.endsWith('.md'))
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('# sprint task content');
      mockParseTaskFile.mockReturnValue(makeTask({ id: 'T2' }));
      mockDb.prepare.mockReturnValue([]);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.tasksUpdated).toBe(1);
      // The scoped id passed to DB should be "sprint-1/T2"
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasks'),
        expect.arrayContaining(['sprint-1/T2']),
      );
    });

    it('records an error when a sprint subfolder cannot be read', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('.tasks'));
      mockFs.readdirSync.mockImplementation((dirPath: unknown) => {
        const p = String(dirPath);
        if (p.endsWith('.tasks')) return [makeDirent('sprint-1', false)];
        throw new Error('Permission denied');
      });

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('sprint-1');
    });
  });

  // ---------------------------------------------------------------------------
  // fullSync — proposal directory / dev-plan files
  // ---------------------------------------------------------------------------

  describe('fullSync — proposal directory', () => {
    it('parses sprint dev-plan files and counts updated gates', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('proposal'));
      mockFs.readdirSync.mockReturnValue(['sprint1-dev-plan.md', 'unrelated.md']);
      mockFs.readFileSync.mockReturnValue('# 開發計畫書: My App — Sprint 1\n');
      mockParseDevPlanSection10.mockReturnValue({
        gateRecords: [{ gateType: 'G0', decision: 'approved', submittedBy: null, reviewer: null, date: null }],
      });
      mockParseConfirmedFlow.mockReturnValue(['G0']);
      // DB: prepare returns existing gate so upsert does an UPDATE
      mockDb.prepare.mockImplementation(() => [{ id: 'gate-uuid-1' }]);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.gatesUpdated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('ignores proposal files that do not match the sprint dev-plan naming pattern', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('proposal'));
      mockFs.readdirSync.mockReturnValue(['notes.md', 'README.md', 'sprint1-dev-plan.md']);
      mockFs.readFileSync.mockReturnValue('# 開發計畫書: App — Sprint 1\n');
      mockParseDevPlanSection10.mockReturnValue({ gateRecords: [] });
      mockParseConfirmedFlow.mockReturnValue([]);
      mockDb.prepare.mockReturnValue([]);

      await projectSync.fullSync('proj-1', '/work/proj');

      // readFileSync should only be called for sprint1-dev-plan.md, not notes/README
      expect(mockFs.readFileSync).toHaveBeenCalledOnce();
    });

    it('emits fileSynced after processing proposal files', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('proposal'));
      mockFs.readdirSync.mockReturnValue(['sprint1-dev-plan.md']);
      mockFs.readFileSync.mockReturnValue('');
      mockParseDevPlanSection10.mockReturnValue({ gateRecords: [] });
      mockParseConfirmedFlow.mockReturnValue([]);
      mockDb.prepare.mockReturnValue([]);

      await projectSync.fullSync('proj-2', '/work/proj2');

      expect(mockEventBus.emitFileSynced).toHaveBeenCalledWith({ projectId: 'proj-2', type: 'full' });
    });

    it('records an error when a dev-plan file throws during parsing', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('proposal'));
      mockFs.readdirSync.mockReturnValue(['sprint1-dev-plan.md']);
      mockFs.readFileSync.mockReturnValue('content');
      mockParseDevPlanSection10.mockImplementation(() => { throw new Error('bad format'); });

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('sprint1-dev-plan.md');
    });

    it('inserts a new gate record when no matching gate exists in DB', async () => {
      mockFs.existsSync.mockImplementation((p: string) => String(p).includes('proposal'));
      mockFs.readdirSync.mockReturnValue(['sprint1-dev-plan.md']);
      mockFs.readFileSync.mockReturnValue('# 開發計畫書: App — Sprint 1\n');
      mockParseDevPlanSection10.mockReturnValue({
        gateRecords: [{ gateType: 'G1', decision: 'approved', submittedBy: 'pm', reviewer: 'cto', date: '2026-01-01' }],
      });
      mockParseConfirmedFlow.mockReturnValue([]);
      // prepare always returns [] → gate does not exist → INSERT path
      mockDb.prepare.mockReturnValue([]);

      const result = await projectSync.fullSync('proj-1', '/work/proj');

      expect(result.gatesUpdated).toBe(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gates'),
        expect.arrayContaining(['G1', 'approved']),
      );
    });
  });
});

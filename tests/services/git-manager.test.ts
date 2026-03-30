// @vitest-environment node

// vi.mock calls are hoisted to the top of the file by Vitest, so they run
// before any imports. We use factory functions to control the mock shape.

const mockExecSync = vi.fn();
const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn();

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  };
});

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { gitManager } from '../../electron/services/git-manager';

const CWD = '/repo';

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('GitManager.getStatus', () => {
  it('returns isRepo=true with branch name from git rev-parse', async () => {
    mockExecSync
      .mockReturnValueOnce('main\n')   // rev-parse --abbrev-ref HEAD
      .mockReturnValueOnce('0\t2\n')   // rev-list ahead/behind
      .mockReturnValueOnce('');        // status --porcelain

    const status = await gitManager.getStatus(CWD);

    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(0);
  });

  it('classifies staged, modified, untracked, and conflicted files correctly', async () => {
    mockExecSync
      .mockReturnValueOnce('main\n')
      .mockReturnValueOnce('0\t0\n')
      .mockReturnValueOnce(
        'M  staged.ts\n' +
        ' M modified.ts\n' +
        '?? untracked.ts\n' +
        'UU conflict.ts\n',
      );

    const status = await gitManager.getStatus(CWD);

    expect(status.staged).toContain('staged.ts');
    expect(status.modified).toContain('modified.ts');
    expect(status.untracked).toContain('untracked.ts');
    expect(status.conflicted).toContain('conflict.ts');
  });

  it('returns isRepo=true with HEAD branch when all git commands fail silently', async () => {
    // tryExec catches errors and returns null, so getStatus still returns isRepo=true
    mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

    const status = await gitManager.getStatus(CWD);

    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('HEAD');
    expect(status.staged).toEqual([]);
  });

  it('defaults ahead/behind to 0 when rev-list throws', async () => {
    mockExecSync
      .mockReturnValueOnce('main\n')
      .mockImplementationOnce(() => { throw new Error('no upstream'); })
      .mockReturnValueOnce('');

    const status = await gitManager.getStatus(CWD);

    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
  });

  it('detects AA conflict marker for both-added files', async () => {
    mockExecSync
      .mockReturnValueOnce('main\n')
      .mockReturnValueOnce('0\t0\n')
      .mockReturnValueOnce('AA conflict.ts\n');

    const status = await gitManager.getStatus(CWD);

    expect(status.conflicted).toContain('conflict.ts');
  });
});

// ---------------------------------------------------------------------------
// getDiff
// ---------------------------------------------------------------------------

describe('GitManager.getDiff', () => {
  it('returns diff entries with insertion and deletion counts', async () => {
    mockExecSync
      .mockReturnValueOnce('10\t5\tsrc/foo.ts\n3\t1\tsrc/bar.ts\n') // diff --numstat
      .mockReturnValueOnce('M\tsrc/foo.ts\nA\tsrc/bar.ts\n');        // diff --name-status

    const diff = await gitManager.getDiff(CWD);

    expect(diff).toHaveLength(2);
    expect(diff[0].file).toBe('src/foo.ts');
    expect(diff[0].insertions).toBe(10);
    expect(diff[0].deletions).toBe(5);
    expect(diff[0].status).toBe('modified');
  });

  it('marks added files with status added', async () => {
    mockExecSync
      .mockReturnValueOnce('5\t0\tnewfile.ts\n')
      .mockReturnValueOnce('A\tnewfile.ts\n');

    const diff = await gitManager.getDiff(CWD);

    expect(diff[0].status).toBe('added');
  });

  it('marks deleted files with status deleted', async () => {
    mockExecSync
      .mockReturnValueOnce('0\t10\told.ts\n')
      .mockReturnValueOnce('D\told.ts\n');

    const diff = await gitManager.getDiff(CWD);

    expect(diff[0].status).toBe('deleted');
  });

  it('returns empty array when execSync throws', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('git error'); });

    const diff = await gitManager.getDiff(CWD);

    expect(diff).toEqual([]);
  });

  it('skips empty lines in numstat output', async () => {
    mockExecSync
      .mockReturnValueOnce('\n\n5\t2\tfile.ts\n\n')
      .mockReturnValueOnce('M\tfile.ts\n');

    const diff = await gitManager.getDiff(CWD);

    expect(diff).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getFileDiff
// ---------------------------------------------------------------------------

describe('GitManager.getFileDiff', () => {
  it('returns original from HEAD and modified from disk', async () => {
    mockExecSync.mockReturnValueOnce('original content');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('modified content');

    const result = await gitManager.getFileDiff(CWD, 'src/foo.ts');

    expect(result.original).toBe('original content');
    expect(result.modified).toBe('modified content');
  });

  it('returns empty original for new (untracked) files', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('no such path'); });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('new file content');

    const result = await gitManager.getFileDiff(CWD, 'src/new.ts');

    expect(result.original).toBe('');
    expect(result.modified).toBe('new file content');
  });

  it('returns empty modified for deleted files', async () => {
    mockExecSync.mockReturnValueOnce('was here');
    mockExistsSync.mockReturnValue(false);

    const result = await gitManager.getFileDiff(CWD, 'deleted.ts');

    expect(result.modified).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getLog
// ---------------------------------------------------------------------------

describe('GitManager.getLog', () => {
  it('parses commit entries from git log output', async () => {
    const hash = 'abc1234';
    const msg = 'feat: add feature';
    const author = 'Dev';
    const date = '2026-03-01';
    const refs = 'HEAD -> main';
    const logLine = `${hash}\x1f${msg}\x1f${author}\x1f${date}\x1f${refs}\x1e`;

    mockExecSync.mockReturnValueOnce(logLine);

    const log = await gitManager.getLog(CWD, 5);

    expect(log).toHaveLength(1);
    expect(log[0].hash).toBe(hash);
    expect(log[0].message).toBe(msg);
    expect(log[0].author).toBe(author);
    expect(log[0].date).toBe(date);
    expect(log[0].refs).toBe(refs);
  });

  it('returns empty array on error', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('git fail'); });

    const log = await gitManager.getLog(CWD);

    expect(log).toEqual([]);
  });

  it('handles multiple commits separated by record separator', async () => {
    const c1 = `hash1\x1fmsg1\x1fauthor1\x1fdate1\x1frefs1`;
    const c2 = `hash2\x1fmsg2\x1fauthor2\x1fdate2\x1frefs2`;
    mockExecSync.mockReturnValueOnce(`${c1}\x1e${c2}\x1e`);

    const log = await gitManager.getLog(CWD);

    expect(log).toHaveLength(2);
    expect(log[0].hash).toBe('hash1');
    expect(log[1].hash).toBe('hash2');
  });
});

// ---------------------------------------------------------------------------
// getBranches
// ---------------------------------------------------------------------------

describe('GitManager.getBranches', () => {
  it('returns current branch and all branches', async () => {
    mockExecSync
      .mockReturnValueOnce('feature/test\n')          // rev-parse HEAD
      .mockReturnValueOnce('main\nfeature/test\n')     // branch -a
      .mockReturnValueOnce(                             // branch -v
        'main\tabc1234\tinitial commit\n' +
        'feature/test\tdef5678\tadd feature\n',
      );

    const info = await gitManager.getBranches(CWD);

    expect(info.current).toBe('feature/test');
    expect(info.all).toContain('main');
    expect(info.all).toContain('feature/test');
    expect(info.branches['feature/test'].current).toBe(true);
    expect(info.branches['main'].current).toBe(false);
  });

  it('returns empty result on error', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not a repo'); });

    const info = await gitManager.getBranches(CWD);

    expect(info.current).toBe('');
    expect(info.all).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// stage
// ---------------------------------------------------------------------------

describe('GitManager.stage', () => {
  it('runs git add . when no files specified', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.stage(CWD);

    expect(mockExecSync).toHaveBeenCalledWith(
      'git add .',
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it('runs git add with specific files when provided', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.stage(CWD, ['src/foo.ts', 'src/bar.ts']);

    const call = mockExecSync.mock.calls[0][0] as string;
    expect(call).toContain('git add -- ');
    expect(call).toContain('src/foo.ts');
  });

  it('rethrows error on git stage failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('stage failed'); });

    await expect(gitManager.stage(CWD)).rejects.toThrow('stage failed');
  });
});

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

describe('GitManager.commit', () => {
  it('runs git commit with the provided message', async () => {
    mockExecSync
      .mockReturnValueOnce('')          // git commit
      .mockReturnValueOnce('a1b2c3d\n') // git rev-parse --short HEAD
      .mockReturnValueOnce(' 3 files changed, 10 insertions(+)'); // diff --shortstat

    const result = await gitManager.commit({ cwd: CWD, message: 'feat: new feature' });

    const commitCall = mockExecSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('git commit'),
    );
    expect(commitCall).toBeTruthy();
    expect(result.hash).toBe('a1b2c3d');
    expect(result.message).toBe('feat: new feature');
    expect(result.filesChanged).toBe(3);
  });

  it('stages specific files before committing when files provided', async () => {
    mockExecSync
      .mockReturnValueOnce('')  // git add
      .mockReturnValueOnce('')  // git commit
      .mockReturnValueOnce('abc\n')
      .mockReturnValueOnce('1 file changed');

    await gitManager.commit({ cwd: CWD, message: 'fix: typo', files: ['README.md'] });

    const firstCall = mockExecSync.mock.calls[0][0] as string;
    expect(firstCall).toContain('git add --');
    expect(firstCall).toContain('README.md');
  });

  it('rethrows on commit failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('nothing to commit'); });

    await expect(
      gitManager.commit({ cwd: CWD, message: 'empty' }),
    ).rejects.toThrow('nothing to commit');
  });
});

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

describe('GitManager.push', () => {
  it('pushes to origin by default and returns success', async () => {
    mockExecSync
      .mockReturnValueOnce('feature\n') // rev-parse HEAD (branch detection)
      .mockReturnValueOnce('');         // git push

    const result = await gitManager.push(CWD);

    expect(result.success).toBe(true);
    expect(result.remote).toBe('origin');
  });

  it('uses provided branch name directly', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.push(CWD, 'origin', 'my-branch');

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('my-branch'),
      expect.anything(),
    );
  });

  it('rethrows on push failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('rejected'); });

    await expect(gitManager.push(CWD)).rejects.toThrow('rejected');
  });
});

// ---------------------------------------------------------------------------
// pull
// ---------------------------------------------------------------------------

describe('GitManager.pull', () => {
  it('returns success with changed file count', async () => {
    mockExecSync.mockReturnValueOnce(' 2 files changed, 5 insertions(+), 3 deletions(-)');

    const result = await gitManager.pull(CWD);

    expect(result.success).toBe(true);
    expect(result.filesChanged).toBe(2);
    expect(result.summary).toContain('2 files changed');
  });

  it('returns "Already up to date" when nothing changed', async () => {
    mockExecSync.mockReturnValueOnce('Already up to date.');

    const result = await gitManager.pull(CWD);

    expect(result.filesChanged).toBe(0);
    expect(result.summary).toBe('Already up to date');
  });

  it('rethrows on pull failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('conflict'); });

    await expect(gitManager.pull(CWD)).rejects.toThrow('conflict');
  });
});

// ---------------------------------------------------------------------------
// branch operations
// ---------------------------------------------------------------------------

describe('GitManager.createBranch', () => {
  it('runs git checkout -b by default', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.createBranch(CWD, 'feature/new');

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git checkout -b'),
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it('runs git branch when checkout=false', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.createBranch(CWD, 'feature/new', false);

    const cmd = mockExecSync.mock.calls[0][0] as string;
    expect(cmd).toContain('git branch');
    expect(cmd).not.toContain('checkout');
  });

  it('rethrows on failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('branch exists'); });

    await expect(gitManager.createBranch(CWD, 'main')).rejects.toThrow('branch exists');
  });
});

describe('GitManager.checkout', () => {
  it('runs git checkout with the given branch name', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.checkout(CWD, 'develop');

    const cmd = mockExecSync.mock.calls[0][0] as string;
    expect(cmd).toContain('git checkout');
    expect(cmd).toContain('develop');
  });

  it('rethrows on checkout failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('branch not found'); });

    await expect(gitManager.checkout(CWD, 'ghost')).rejects.toThrow('branch not found');
  });
});

describe('GitManager.deleteBranch', () => {
  it('uses -d flag by default', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.deleteBranch(CWD, 'old-branch');

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-d '),
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it('uses -D flag when force=true', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.deleteBranch(CWD, 'old-branch', true);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-D '),
      expect.objectContaining({ cwd: CWD }),
    );
  });
});

// ---------------------------------------------------------------------------
// worktree operations
// ---------------------------------------------------------------------------

describe('GitManager.listWorktrees', () => {
  it('parses worktree porcelain output into structured list', async () => {
    const raw = [
      'worktree /main',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /worktrees/feature',
      'HEAD def456',
      'branch refs/heads/feature/test',
      '',
    ].join('\n');
    mockExecSync.mockReturnValueOnce(raw);

    const worktrees = await gitManager.listWorktrees(CWD);

    expect(worktrees).toHaveLength(2);
    expect(worktrees[0].path).toBe('/main');
    expect(worktrees[0].branch).toBe('main');
    expect(worktrees[0].isMain).toBe(true);
    expect(worktrees[1].branch).toBe('feature/test');
    expect(worktrees[1].isMain).toBe(false);
  });

  it('returns empty array on error', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not a repo'); });

    const worktrees = await gitManager.listWorktrees(CWD);

    expect(worktrees).toEqual([]);
  });
});

describe('GitManager.createWorktree', () => {
  it('calls git worktree add with branch and path', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.createWorktree(CWD, 'feature/wt', '/tmp/wt-path');

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree add'),
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it('rethrows on failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('worktree error'); });

    await expect(
      gitManager.createWorktree(CWD, 'branch', '/path'),
    ).rejects.toThrow('worktree error');
  });
});

describe('GitManager.removeWorktree', () => {
  it('calls git worktree remove --force', async () => {
    mockExecSync.mockReturnValueOnce('');

    await gitManager.removeWorktree(CWD, '/tmp/wt-path');

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it('rethrows on failure', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('remove failed'); });

    await expect(gitManager.removeWorktree(CWD, '/path')).rejects.toThrow('remove failed');
  });
});

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';
import type {
  GitStatus, DiffEntry, WorktreeInfo, CommitInfo, GitBranchInfo,
  GitCommitParams, GitCommitResult, GitPushResult, GitPullResult,
} from '../types';

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function tryExec(cmd: string, cwd: string): string | null {
  try {
    return exec(cmd, cwd);
  } catch {
    return null;
  }
}

class GitManager {
  async getStatus(cwd: string): Promise<GitStatus> {
    try {
      const branch = (tryExec('git rev-parse --abbrev-ref HEAD', cwd) ?? 'HEAD').trim();

      const aheadBehindRaw = tryExec('git rev-list --left-right --count @{u}...HEAD', cwd);
      let ahead = 0;
      let behind = 0;
      if (aheadBehindRaw) {
        const parts = aheadBehindRaw.trim().split(/\s+/);
        behind = parseInt(parts[0] ?? '0', 10) || 0;
        ahead = parseInt(parts[1] ?? '0', 10) || 0;
      }

      const statusRaw = tryExec('git status --porcelain', cwd) ?? '';
      const staged: string[] = [];
      const modified: string[] = [];
      const untracked: string[] = [];
      const conflicted: string[] = [];

      for (const line of statusRaw.split('\n')) {
        if (!line) continue;
        const x = line[0];
        const y = line[1];
        const file = line.slice(3);

        if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
          conflicted.push(file);
        } else if (x !== ' ' && x !== '?') {
          staged.push(file);
        }

        if (y === 'M' || y === 'D') {
          modified.push(file);
        } else if (x === '?' && y === '?') {
          untracked.push(file);
        }
      }

      return { isRepo: true, branch, ahead, behind, staged, modified, untracked, conflicted };
    } catch {
      return { isRepo: false, branch: '', ahead: 0, behind: 0, staged: [], modified: [], untracked: [], conflicted: [] };
    }
  }

  async getDiff(cwd: string): Promise<DiffEntry[]> {
    try {
      const raw = tryExec('git diff --numstat HEAD', cwd) ?? '';
      const entries: DiffEntry[] = [];

      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const insertions = parseInt(parts[0] ?? '0', 10) || 0;
        const deletions = parseInt(parts[1] ?? '0', 10) || 0;
        const file = parts[2] ?? '';

        // Detect status via git diff --name-status HEAD
        entries.push({ file, status: 'modified', insertions, deletions });
      }

      // Enrich with actual status (A/D/R/M)
      const nameStatus = tryExec('git diff --name-status HEAD', cwd) ?? '';
      const statusMap: Record<string, DiffEntry['status']> = {};
      for (const line of nameStatus.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const flag = parts[0]?.[0] ?? 'M';
        const file = parts[1] ?? '';
        if (flag === 'A') statusMap[file] = 'added';
        else if (flag === 'D') statusMap[file] = 'deleted';
        else if (flag === 'R') statusMap[parts[2] ?? file] = 'renamed';
        else statusMap[file] = 'modified';
      }

      return entries.map((e) => ({ ...e, status: statusMap[e.file] ?? e.status }));
    } catch (err) {
      logger.warn('Failed to get diff', err);
      return [];
    }
  }

  async getFileDiff(
    cwd: string,
    filePath: string,
  ): Promise<{ original: string; modified: string }> {
    try {
      let original = '';
      try {
        original = exec(`git show HEAD:${filePath}`, cwd);
      } catch {
        // New file — no HEAD version
      }

      let modified = '';
      try {
        const fullPath = join(cwd, filePath);
        if (existsSync(fullPath)) {
          modified = readFileSync(fullPath, 'utf-8');
        }
      } catch {
        // Deleted file
      }

      return { original, modified };
    } catch (err) {
      logger.warn(`Failed to get file diff for ${filePath}`, err);
      return { original: '', modified: '' };
    }
  }

  async getLog(cwd: string, limit = 20): Promise<CommitInfo[]> {
    try {
      const format = '%H%x1f%s%x1f%an%x1f%ai%x1f%D%x1e';
      const raw = tryExec(`git log -${limit} --format="${format}"`, cwd) ?? '';
      const commits: CommitInfo[] = [];

      for (const entry of raw.split('\x1e')) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('\x1f');
        commits.push({
          hash: parts[0] ?? '',
          message: parts[1] ?? '',
          author: parts[2] ?? '',
          date: parts[3] ?? '',
          refs: parts[4] ?? '',
        });
      }

      return commits;
    } catch (err) {
      logger.warn('Failed to get git log', err);
      return [];
    }
  }

  async getBranches(cwd: string): Promise<GitBranchInfo> {
    try {
      const currentRaw = tryExec('git rev-parse --abbrev-ref HEAD', cwd) ?? '';
      const current = currentRaw.trim();

      const allRaw = tryExec('git branch -a --format=%(refname:short)', cwd) ?? '';
      const all = allRaw.split('\n').map((b) => b.trim()).filter(Boolean);

      const branchesRaw = tryExec('git branch -v --format=%(refname:short)%09%(objectname:short)%09%(contents:subject)', cwd) ?? '';
      const branches: GitBranchInfo['branches'] = {};
      for (const line of branchesRaw.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const name = parts[0]?.trim() ?? '';
        const commit = parts[1]?.trim() ?? '';
        const label = parts[2]?.trim() ?? '';
        if (name) {
          branches[name] = { current: name === current, name, commit, label };
        }
      }

      return { current, all, branches };
    } catch (err) {
      logger.warn('Failed to get branches', err);
      return { current: '', all: [], branches: {} };
    }
  }

  async stage(cwd: string, files?: string[]): Promise<void> {
    try {
      if (files && files.length > 0) {
        const escaped = files.map((f) => `"${f}"`).join(' ');
        exec(`git add -- ${escaped}`, cwd);
      } else {
        exec('git add .', cwd);
      }
    } catch (err) {
      logger.error('Git stage failed', err);
      throw err;
    }
  }

  async commit(params: GitCommitParams): Promise<GitCommitResult> {
    try {
      if (params.files && params.files.length > 0) {
        const escaped = params.files.map((f) => `"${f}"`).join(' ');
        exec(`git add -- ${escaped}`, params.cwd);
      }

      const escapedMsg = params.message.replace(/"/g, '\\"');
      exec(`git commit -m "${escapedMsg}"`, params.cwd);

      const hash = (tryExec('git rev-parse --short HEAD', params.cwd) ?? '').trim();
      const statsRaw = tryExec('git diff --shortstat HEAD~1 HEAD', params.cwd) ?? '';
      const changesMatch = statsRaw.match(/(\d+)\s+file/);
      const filesChanged = changesMatch ? parseInt(changesMatch[1] ?? '0', 10) : 0;

      return { hash, message: params.message, filesChanged };
    } catch (err) {
      logger.error('Git commit failed', err);
      throw err;
    }
  }

  async push(cwd: string, remote = 'origin', branch?: string, setUpstream = false): Promise<GitPushResult> {
    try {
      const currentBranch = branch ?? (tryExec('git rev-parse --abbrev-ref HEAD', cwd) ?? 'main').trim();
      const upstreamFlag = setUpstream ? '--set-upstream ' : '';
      exec(`git push ${upstreamFlag}${remote} ${currentBranch}`, cwd);
      return { success: true, branch: currentBranch, remote };
    } catch (err) {
      logger.error('Git push failed', err);
      throw err;
    }
  }

  async pull(cwd: string, remote = 'origin', branch?: string): Promise<GitPullResult> {
    try {
      const target = branch ? `${remote} ${branch}` : remote;
      const raw = exec(`git pull ${target}`, cwd);

      const changesMatch = raw.match(/(\d+)\s+file/);
      const insertionsMatch = raw.match(/(\d+)\s+insertion/);
      const deletionsMatch = raw.match(/(\d+)\s+deletion/);
      const filesChanged = changesMatch ? parseInt(changesMatch[1] ?? '0', 10) : 0;

      const summary = filesChanged > 0
        ? `${filesChanged} files changed, ${insertionsMatch?.[1] ?? 0} insertions, ${deletionsMatch?.[1] ?? 0} deletions`
        : 'Already up to date';

      return { success: true, summary, filesChanged };
    } catch (err) {
      logger.error('Git pull failed', err);
      throw err;
    }
  }

  async createBranch(cwd: string, branchName: string, checkout = true): Promise<void> {
    try {
      if (checkout) {
        exec(`git checkout -b "${branchName}"`, cwd);
      } else {
        exec(`git branch "${branchName}"`, cwd);
      }
      logger.info(`Created branch ${branchName}${checkout ? ' (checked out)' : ''}`);
    } catch (err) {
      logger.error(`Failed to create branch ${branchName}`, err);
      throw err;
    }
  }

  async checkout(cwd: string, branchName: string): Promise<void> {
    try {
      exec(`git checkout "${branchName}"`, cwd);
      logger.info(`Checked out branch ${branchName}`);
    } catch (err) {
      logger.error(`Failed to checkout branch ${branchName}`, err);
      throw err;
    }
  }

  async deleteBranch(cwd: string, branchName: string, force = false): Promise<void> {
    try {
      const flag = force ? '-D' : '-d';
      exec(`git branch ${flag} "${branchName}"`, cwd);
      logger.info(`Deleted branch ${branchName}`);
    } catch (err) {
      logger.error(`Failed to delete branch ${branchName}`, err);
      throw err;
    }
  }

  async createWorktree(cwd: string, branch: string, path: string): Promise<void> {
    try {
      exec(`git worktree add "${path}" -b "${branch}"`, cwd);
      logger.info(`Created worktree at ${path} with branch ${branch}`);
    } catch (err) {
      logger.error('Failed to create worktree', err);
      throw err;
    }
  }

  async removeWorktree(cwd: string, path: string): Promise<void> {
    try {
      exec(`git worktree remove "${path}" --force`, cwd);
      logger.info(`Removed worktree at ${path}`);
    } catch (err) {
      logger.error('Failed to remove worktree', err);
      throw err;
    }
  }

  async listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
    try {
      const raw = exec('git worktree list --porcelain', cwd);
      const worktrees: WorktreeInfo[] = [];
      let current: Partial<WorktreeInfo> = {};

      for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as WorktreeInfo);
          current = { path: line.slice(9).trim(), isMain: false };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice(5).trim();
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).trim().replace('refs/heads/', '');
        } else if (line.trim() === '') {
          if (current.path) {
            worktrees.push({
              path: current.path,
              branch: current.branch || 'detached',
              head: current.head || '',
              isMain: worktrees.length === 0,
            });
            current = {};
          }
        }
      }

      return worktrees;
    } catch (err) {
      logger.warn('Failed to list worktrees', err);
      return [];
    }
  }
}

export const gitManager = new GitManager();

import { app } from 'electron';
import { join, basename, dirname, resolve, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Validate that a resolved file path stays within a base directory.
 * Prevents path traversal attacks via ../ or symlinks.
 * Returns the resolved path if safe, null if traversal detected.
 */
export function safePath(baseDir: string, relativePath: string): string | null {
  const resolved = resolve(baseDir, relativePath);
  const rel = relative(baseDir, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

/**
 * Get the project root directory.
 * In dev mode (electron-vite dev), app.getAppPath() = project root.
 * When launched from out/main/index.js (e.g. Playwright E2E), app.getAppPath() = out/main,
 * so we need to go up two levels to reach the project root.
 */
function getProjectRoot(): string {
  const appPath = app.getAppPath();
  // If we're inside out/main (E2E / manual launch), go up to project root
  if (basename(dirname(appPath)) === 'out' && basename(appPath) === 'main') {
    return dirname(dirname(appPath));
  }
  return appPath;
}

export function getDataDir(): string {
  return app.getPath('userData');
}

export function getDbPath(): string {
  return join(getDataDir(), 'maestro.db');
}

export function getAgentsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'agents');
  }
  return join(getProjectRoot(), 'agents');
}

export function getKnowledgeDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, '.knowledge');
  }
  return join(getProjectRoot(), '.knowledge');
}

export function getMigrationsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'migrations');
  }
  return join(getProjectRoot(), 'electron', 'migrations');
}

export function getSessionLogsDir(): string {
  return join(getDataDir(), 'session-logs');
}

/**
 * Get the Claude Code projects directory for a given cwd.
 * Claude Code stores conversations at: ~/.claude/projects/<encoded-cwd>/<id>.jsonl
 * The cwd is encoded by replacing path separators with '--'.
 */
export function getClaudeConversationsDir(cwd: string): string {
  // Claude Code encodes the cwd: C:\agent-hub -> C--agent-hub
  // Both : and \ (and /) are each replaced with '-'
  const encoded = cwd.replace(/[:\\/]/g, '-');
  return join(homedir(), '.claude', 'projects', encoded);
}

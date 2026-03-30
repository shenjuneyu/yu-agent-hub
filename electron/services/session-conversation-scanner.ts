import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { database } from './database';
import { logger } from '../utils/logger';
import { getClaudeConversationsDir } from '../utils/paths';
import type { ResumableSession } from '../types';

// ─── Conversation file scanning ───────────────────────────────────────────────

/**
 * Read the first user message from a Claude Code conversation .jsonl file.
 * Each line is a JSON object. We look for the first line with type 'human' or role 'user'.
 */
export function extractFirstUserMessage(filePath: string): string | null {
  try {
    const fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(4096); // Read first 4KB — enough for first message
    const bytesRead = readSync(fd, buf, 0, 4096, 0);
    closeSync(fd);

    const text = buf.toString('utf-8', 0, bytesRead);
    const lines = text.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // Claude Code format: type 'human' with message content
        if (obj.type === 'human' && obj.message) {
          const content = typeof obj.message === 'string'
            ? obj.message
            : Array.isArray(obj.message)
              ? obj.message.find((m: { type: string; text?: string }) => m.type === 'text')?.text || ''
              : '';
          return content.slice(0, 200); // Truncate to 200 chars
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error
  }
  return null;
}

/**
 * Scan all registered project work directories for resumable Claude Code conversations.
 * Returns conversations sorted by last modified time (most recent first).
 */
export function scanResumableSessions(limit = 50): ResumableSession[] {
  const results: ResumableSession[] = [];

  // Collect work directories: AgentHub itself + all projects with work_dir
  const dirs: { path: string; name: string }[] = [
    { path: process.cwd(), name: 'AgentHub' },
  ];

  try {
    const projects = database.prepare(
      "SELECT id, name, work_dir FROM projects WHERE work_dir IS NOT NULL AND work_dir != ''",
    );
    for (const p of projects) {
      if (p.work_dir) {
        dirs.push({ path: p.work_dir, name: p.name || p.id });
      }
    }
  } catch {
    // DB may not be ready
  }

  for (const dir of dirs) {
    const convDir = getClaudeConversationsDir(dir.path);
    if (!existsSync(convDir)) continue;

    let files: string[];
    try {
      files = readdirSync(convDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = join(convDir, file);
      try {
        const stat = statSync(filePath);
        const conversationId = file.replace('.jsonl', '');

        // Read first few lines to extract first user message
        const firstMessage = extractFirstUserMessage(filePath);

        results.push({
          conversationId,
          projectPath: dir.path,
          projectName: dir.name,
          firstMessage: firstMessage || '(no message)',
          lastModified: stat.mtime.toISOString(),
          fileSize: stat.size,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  logger.info(`Scanned ${results.length} resumable conversations across ${dirs.length} directory(s)`);

  // Sort by lastModified descending, take limit
  results.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  return results.slice(0, limit);
}

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { getKnowledgeDir, safePath } from '../utils/paths';
import { logger } from '../utils/logger';
import type { KnowledgeTreeNode } from '../types';

class KnowledgeReader {
  /**
   * Build directory tree from the knowledge directory.
   */
  listTree(): KnowledgeTreeNode[] {
    let knowledgeDir = getKnowledgeDir();

    // Fallback: if getKnowledgeDir() path doesn't exist, try process.cwd()/knowledge
    if (!existsSync(knowledgeDir)) {
      const fallback = join(process.cwd(), 'knowledge');
      if (existsSync(fallback)) {
        knowledgeDir = fallback;
      } else {
        return [];
      }
    }

    return this.buildTree(knowledgeDir, knowledgeDir);
  }

  /**
   * Read a file from the knowledge directory.
   */
  readFile(relativePath: string): string | null {
    let knowledgeDir = getKnowledgeDir();
    // Fallback: same as listTree
    if (!existsSync(knowledgeDir)) {
      const fallback = join(process.cwd(), 'knowledge');
      if (existsSync(fallback)) knowledgeDir = fallback;
    }

    // Security: ensure path stays within knowledge dir (prevent path traversal)
    const filePath = safePath(knowledgeDir, relativePath);
    if (!filePath) {
      logger.warn(`Blocked path traversal attempt: ${relativePath}`);
      return null;
    }

    if (!existsSync(filePath)) return null;

    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      logger.error(`Failed to read knowledge file: ${filePath}`, err);
      return null;
    }
  }

  /**
   * Search knowledge files for a query string.
   */
  search(query: string): Array<{ path: string; name: string; snippet: string }> {
    const knowledgeDir = getKnowledgeDir();
    if (!existsSync(knowledgeDir)) return [];

    const results: Array<{ path: string; name: string; snippet: string }> = [];
    const q = query.toLowerCase();

    this.walkFiles(knowledgeDir, (filePath) => {
      const ext = extname(filePath).toLowerCase();
      if (!['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext)) return;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const lowerContent = content.toLowerCase();
        const idx = lowerContent.indexOf(q);

        if (idx !== -1) {
          const relPath = relative(knowledgeDir, filePath).replace(/\\/g, '/');
          const start = Math.max(0, idx - 50);
          const end = Math.min(content.length, idx + query.length + 50);
          const snippet = content.slice(start, end).replace(/\n/g, ' ');

          results.push({
            path: relPath,
            name: filePath.split(/[\\/]/).pop() || '',
            snippet: (start > 0 ? '...' : '') + snippet + (end < content.length ? '...' : ''),
          });
        }
      } catch { /* ignore unreadable files */ }
    });

    return results;
  }

  private buildTree(dir: string, rootDir: string): KnowledgeTreeNode[] {
    const items: KnowledgeTreeNode[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = join(dir, entry.name);
        const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
            children: this.buildTree(fullPath, rootDir),
          });
        } else {
          items.push({
            name: entry.name,
            path: relPath,
            type: 'file',
          });
        }
      }
    } catch (err) {
      logger.warn(`Failed to read directory: ${dir}`, err);
    }

    return items;
  }

  private walkFiles(dir: string, callback: (filePath: string) => void): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          this.walkFiles(fullPath, callback);
        } else {
          callback(fullPath);
        }
      }
    } catch { /* ignore */ }
  }
}

export const knowledgeReader = new KnowledgeReader();

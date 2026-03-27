import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getDbPath, getMigrationsDir } from '../utils/paths';
import { logger } from '../utils/logger';

class DatabaseService {
  private db: SqlJsDatabase | null = null;
  private dbPath: string = '';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(): Promise<void> {
    this.dbPath = getDbPath();
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    logger.info(`Opening database at ${this.dbPath}`);

    const SQL = await initSqlJs();

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run('PRAGMA foreign_keys = ON');
    this.runMigrations();
    this.saveToDisk();
  }

  getDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  run(sql: string, params?: unknown[]): void {
    this.getDb().run(sql, params as any);
    this.scheduleSave();
  }

  exec(sql: string): void {
    this.getDb().exec(sql);
    this.scheduleSave();
  }

  prepare(sql: string, params?: unknown[]): any[] {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params as any);

    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  clearAllData(): { deletedCounts: Record<string, number> } {
    const db = this.getDb();
    const tables = [
      'user_preferences',
      'session_events',
      'decisions',
      'sprint_reviews',
      'task_dependencies',
      'claude_sessions',
      'audit_logs',
      'gates',
      'tasks',
      'sprints',
      'projects',
    ];

    const deletedCounts: Record<string, number> = {};

    db.run('BEGIN TRANSACTION');
    try {
      for (const table of tables) {
        const countRows = this.prepare(`SELECT COUNT(*) as cnt FROM ${table}`);
        const count = countRows.length > 0 ? (countRows[0].cnt as number) : 0;
        db.run(`DELETE FROM ${table}`);
        deletedCounts[table] = count;
      }
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      logger.error('clearAllData failed, rolled back', err);
      throw err;
    }

    this.scheduleSave();
    logger.info('clearAllData completed', deletedCounts);
    return { deletedCounts };
  }

  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.db) {
      this.saveToDisk();
      this.db.close();
      this.db = null;
      logger.info('Database closed');
    }
  }

  saveToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToDisk(), 1000);
  }

  private runMigrations(): void {
    const db = this.getDb();

    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name    TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const appliedRows = this.prepare('SELECT version FROM schema_migrations');
    const applied = new Set(appliedRows.map((row: any) => row.version as number));

    const migrationsDir = getMigrationsDir();
    if (!existsSync(migrationsDir)) {
      logger.warn(`Migrations directory not found: ${migrationsDir}`);
      return;
    }

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const version = parseInt(match[1], 10);
      const name = match[2];

      if (applied.has(version)) continue;

      logger.info(`Running migration ${version}: ${name}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        db.run('BEGIN TRANSACTION');
        db.exec(sql);
        db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [version, name]);
        db.run('COMMIT');
        logger.info(`Migration ${version} applied successfully`);
      } catch (err) {
        db.run('ROLLBACK');
        logger.error(`Migration ${version} failed`, err);
        throw err;
      }
    }
  }
}

export const database = new DatabaseService();

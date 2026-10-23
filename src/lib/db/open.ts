import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { migrate, type Migration } from './migrate';
import { MIGRATIONS } from './migrations';

export interface OpenOptions {
  /** Migrations to apply; defaults to the app's. Tests pass subsets. */
  migrations?: readonly Migration[];
  /** Stop migrating at this version (upgrade-path tests). */
  upTo?: number;
  /** Where pre-migration backups go. Only used for file databases that already have a schema. */
  backupDir?: string;
}

export function applyPragmas(db: DatabaseSync, isFile: boolean): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (isFile) db.exec('PRAGMA journal_mode = WAL');
}

/** Writes a consistent copy of the database (safe with WAL). Returns the backup path. */
export function backupDatabase(db: DatabaseSync, backupDir: string, label: string): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `${label}-${stamp}.sqlite`);
  db.prepare('VACUUM INTO ?').run(target);
  return target;
}

/**
 * Opens (creating if needed) a database, applies pragmas and runs pending migrations.
 * `filename` may be ':memory:' for tests.
 */
export function openDatabase(filename: string, options: OpenOptions = {}): DatabaseSync {
  const isFile = filename !== ':memory:';
  if (isFile) fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    applyPragmas(db, isFile);
    migrate(db, options.migrations ?? MIGRATIONS, {
      upTo: options.upTo,
      beforeApply: ({ from }) => {
        if (isFile && options.backupDir) backupDatabase(db, options.backupDir, `pre-migrate-v${from}`);
      },
    });
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

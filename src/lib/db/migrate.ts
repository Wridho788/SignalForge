import type { DatabaseSync } from 'node:sqlite';
import { inTransaction } from './tx';

export interface Migration {
  version: number;
  name: string;
  /** Plain SQL (multiple statements allowed). Include a recovery note in the migration file. */
  up: string;
}

const SCHEMA_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export function assertMigrationsValid(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migrations must be contiguous from 1; found version ${m.version} at index ${i}.`);
    }
  });
}

export function currentSchemaVersion(db: DatabaseSync): number {
  db.exec(SCHEMA_TABLE);
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as {
    v: number;
  };
  return Number(row.v);
}

export interface MigrateOptions {
  /** Called once, before the first pending migration, only when the DB already has a schema. */
  beforeApply?: (info: { from: number; to: number }) => void;
  /** Stop after this version (used by upgrade-path tests). */
  upTo?: number;
}

export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[],
  options: MigrateOptions = {},
): { from: number; to: number; applied: number[] } {
  assertMigrationsValid(migrations);
  const from = currentSchemaVersion(db);
  const latest = migrations.length;
  if (from > latest) {
    throw new Error(
      `Database schema v${from} is newer than this app (v${latest}). Upgrade SignalForge; refusing to open.`,
    );
  }
  const target = Math.min(options.upTo ?? latest, latest);
  const pending = migrations.filter((m) => m.version > from && m.version <= target);
  if (pending.length === 0) return { from, to: from, applied: [] };

  if (from > 0) options.beforeApply?.({ from, to: target });

  const applied: number[] = [];
  for (const m of pending) {
    inTransaction(db, () => {
      db.exec(m.up);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
    });
    applied.push(m.version);
  }
  return { from, to: target, applied };
}

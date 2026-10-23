import type { DatabaseSync } from 'node:sqlite';

const depth = new WeakMap<DatabaseSync, number>();

/**
 * Runs `fn` atomically. Nested calls use savepoints, so an inner failure rolls back only the
 * inner work. Everything is rolled back if `fn` throws.
 */
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  const level = depth.get(db) ?? 0;
  const name = `sf_sp_${level}`;
  db.exec(`SAVEPOINT ${name}`);
  depth.set(db, level + 1);
  try {
    const result = fn();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  } finally {
    depth.set(db, level);
  }
}

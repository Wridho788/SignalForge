import 'server-only';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DATABASE_FILE_NAME, resolveDataDir } from '../config';
import { openDatabase } from './open';

// Survives dev HMR module reloads so we do not open a new connection per edit.
const globalForDb = globalThis as unknown as { __signalforgeDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__signalforgeDb) {
    const dataDir = resolveDataDir();
    globalForDb.__signalforgeDb = openDatabase(path.join(dataDir, DATABASE_FILE_NAME), {
      backupDir: path.join(dataDir, 'backups'),
    });
  }
  return globalForDb.__signalforgeDb;
}

import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { get, nowIso, run } from '../db/query';

export function getSetting(db: DatabaseSync, key: string): string | null {
  return get<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', [key])?.value ?? null;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  run(
    db,
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}

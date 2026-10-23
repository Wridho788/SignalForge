import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/** Typed helpers over node:sqlite. SQL text is always static; values are always bound. */
export function all<T>(db: DatabaseSync, sql: string, params: SQLInputValue[] = []): T[] {
  return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map((r) => ({ ...r }) as T);
}

export function get<T>(db: DatabaseSync, sql: string, params: SQLInputValue[] = []): T | undefined {
  const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return row ? ({ ...row } as T) : undefined;
}

export function run(db: DatabaseSync, sql: string, params: SQLInputValue[] = []): number {
  return Number(db.prepare(sql).run(...params).changes);
}

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => crypto.randomUUID();

/** True for SQLite UNIQUE violations, optionally naming the index/columns involved. */
export function isUniqueViolation(error: unknown, needle?: string): boolean {
  if (!(error instanceof Error)) return false;
  if (!/UNIQUE constraint failed/i.test(error.message)) return false;
  return needle ? error.message.includes(needle) : true;
}

/** Escapes LIKE wildcards so user search text is matched literally (use with ESCAPE '\'). */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

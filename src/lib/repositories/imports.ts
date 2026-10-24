import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { all, get, newId, nowIso, run } from '../db/query';

export type ImportStatus = 'previewed' | 'committed' | 'failed' | 'cancelled';
export type DuplicatePolicy = 'skip' | 'supersede';

export interface ImportJobRow {
  id: string;
  fileName: string;
  status: ImportStatus;
  duplicatePolicy: DuplicatePolicy | null;
  startedAt: string;
  completedAt: string | null;
  rowsTotal: number;
  rowsValid: number;
  rowsRejected: number;
  snapshotsCreated: number;
  errorSummary: string | null;
}

const COLUMNS = `
  id, file_name AS fileName, status, duplicate_policy AS duplicatePolicy, started_at AS startedAt,
  completed_at AS completedAt, rows_total AS rowsTotal, rows_valid AS rowsValid, rows_rejected AS rowsRejected,
  snapshots_created AS snapshotsCreated, error_summary AS errorSummary`;

const num = (r: ImportJobRow): ImportJobRow => ({
  ...r,
  rowsTotal: Number(r.rowsTotal),
  rowsValid: Number(r.rowsValid),
  rowsRejected: Number(r.rowsRejected),
  snapshotsCreated: Number(r.snapshotsCreated),
});

export function insertImportJob(
  db: DatabaseSync,
  f: { fileName: string; content: string; startedAt: string; rowsTotal: number; rowsValid: number; rowsRejected: number; errorSummary: string | null },
): string {
  const id = newId();
  run(
    db,
    `INSERT INTO import_jobs (id, file_name, status, started_at, rows_total, rows_valid, rows_rejected, error_summary, content)
     VALUES (?, ?, 'previewed', ?, ?, ?, ?, ?, ?)`,
    [id, f.fileName, f.startedAt, f.rowsTotal, f.rowsValid, f.rowsRejected, f.errorSummary, f.content],
  );
  return id;
}

export function getImportJob(db: DatabaseSync, id: string): ImportJobRow | undefined {
  const r = get<ImportJobRow>(db, `SELECT ${COLUMNS} FROM import_jobs WHERE id = ?`, [id]);
  return r ? num(r) : undefined;
}

/** The staged CSV text; NULL once the job is no longer previewable. */
export function getImportContent(db: DatabaseSync, id: string): string | null {
  return get<{ content: string | null }>(db, 'SELECT content FROM import_jobs WHERE id = ?', [id])?.content ?? null;
}

export function listImportJobs(db: DatabaseSync, limit = 20): ImportJobRow[] {
  return all<ImportJobRow>(db, `SELECT ${COLUMNS} FROM import_jobs ORDER BY started_at DESC, rowid DESC LIMIT ?`, [limit]).map(num);
}

export function finishImportJob(
  db: DatabaseSync,
  id: string,
  f: {
    status: Exclude<ImportStatus, 'previewed'>;
    duplicatePolicy?: DuplicatePolicy | null;
    rowsTotal?: number;
    rowsValid?: number;
    rowsRejected?: number;
    snapshotsCreated?: number;
    errorSummary?: string | null;
  },
): void {
  // Staged content is dropped as soon as the job is finished, so imported records are not retained.
  run(
    db,
    `UPDATE import_jobs SET status = ?, completed_at = ?, content = NULL,
       duplicate_policy = COALESCE(?, duplicate_policy),
       rows_total = COALESCE(?, rows_total), rows_valid = COALESCE(?, rows_valid), rows_rejected = COALESCE(?, rows_rejected),
       snapshots_created = COALESCE(?, snapshots_created), error_summary = COALESCE(?, error_summary)
     WHERE id = ?`,
    [f.status, nowIso(), f.duplicatePolicy ?? null, f.rowsTotal ?? null, f.rowsValid ?? null, f.rowsRejected ?? null, f.snapshotsCreated ?? null, f.errorSummary ?? null, id],
  );
}

/** Cancels previews older than `olderThanIso` and drops their staged content. */
export function expireOldPreviews(db: DatabaseSync, olderThanIso: string): number {
  return run(
    db,
    `UPDATE import_jobs SET status = 'cancelled', completed_at = ?, content = NULL,
       error_summary = COALESCE(error_summary, 'Pratinjau kedaluwarsa.')
     WHERE status = 'previewed' AND started_at < ?`,
    [nowIso(), olderThanIso],
  );
}

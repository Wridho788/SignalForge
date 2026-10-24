import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DomainError } from '../domain/errors';
import { backupDatabase, openDatabase } from '../db/open';
import { MIGRATIONS } from '../db/migrations';
import { inTransaction } from '../db/tx';

export const MAX_RESTORE_BYTES = 25 * 1024 * 1024;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'latin1');
const BACKUP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.sqlite$/;
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAGING_TTL_MS = 60 * 60 * 1000;

/** Tables copied on restore, parents first. `platforms` and `schema_migrations` are app constants and stay. */
const RESTORE_ORDER = [
  'app_settings',
  'metric_definitions',
  'episodes',
  'tags',
  'episode_tags',
  'distributions',
  'import_jobs',
  'metric_snapshots',
  'metric_values',
  'experiments',
  'experiment_secondary_metrics',
  'experiment_distributions',
  'experiment_events',
] as const;

export interface BackupFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  kind: 'manual' | 'pre-migrate' | 'pre-restore' | 'other';
}

function kindOf(name: string): BackupFile['kind'] {
  if (name.startsWith('manual-')) return 'manual';
  if (name.startsWith('pre-migrate-')) return 'pre-migrate';
  if (name.startsWith('pre-restore-')) return 'pre-restore';
  return 'other';
}

/** Consistent snapshot of the live database (safe while the app is running). */
export function createBackup(db: DatabaseSync, backupDir: string, label: 'manual' | 'pre-restore' = 'manual'): BackupFile {
  const file = backupDatabase(db, backupDir, label);
  const stat = fs.statSync(file);
  const name = path.basename(file);
  return { name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), kind: kindOf(name) };
}

export function listBackups(backupDir: string): BackupFile[] {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((n) => BACKUP_NAME_RE.test(n))
    .flatMap((name) => {
      const stat = fs.statSync(path.join(backupDir, name));
      return stat.isFile() ? [{ name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), kind: kindOf(name) }] : [];
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || b.name.localeCompare(a.name));
}

/** Only plain file names inside the backup directory are ever served; anything else yields null. */
export function resolveBackupPath(backupDir: string, name: string): string | null {
  if (!BACKUP_NAME_RE.test(name)) return null;
  const full = path.resolve(backupDir, name);
  if (path.dirname(full) !== path.resolve(backupDir)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

// --- restore: validation ---

export interface RestoreSummary {
  schemaVersion: number;
  willMigrateFrom: number | null;
  episodes: number;
  distributions: number;
  snapshots: number;
  experiments: number;
}

function stagingDir(dataDir: string): string {
  return path.join(dataDir, 'restore-tmp');
}

/** Removes a staged database and the SQLite side files it may have produced. */
function removeStagedFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(`${file}${suffix}`, { force: true });
}

export function stagingPath(dataDir: string, token: string): string | null {
  return TOKEN_RE.test(token) ? path.join(stagingDir(dataDir), `${token}.sqlite`) : null;
}

function cleanStaging(dataDir: string, now: number): void {
  const dir = stagingDir(dataDir);
  if (!fs.existsSync(dir)) return;
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    try {
      if (now - fs.statSync(f).mtimeMs > STAGING_TTL_MS) removeStagedFiles(f);
    } catch {
      // best effort
    }
  }
}

function expectedSchemaObjects(): Map<string, string> {
  const ref = openDatabase(':memory:');
  try {
    const rows = ref.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('trigger','view')").all() as { name: string; sql: string }[];
    return new Map(rows.map((r) => [r.name, r.sql]));
  } finally {
    ref.close();
  }
}

const count = (db: DatabaseSync, table: string): number => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

/**
 * Validates an uploaded SQLite file WITHOUT touching the live database and stages a migrated copy.
 * Defense in depth against a hostile or damaged file: header check, size cap, read-only integrity
 * check, trusted_schema off, no triggers/views other than the app's own, no newer schema.
 */
export function stageRestoreFile(
  dataDir: string,
  bytes: Uint8Array,
  now: Date = new Date(),
): { token: string; summary: RestoreSummary } {
  if (bytes.byteLength === 0) throw new DomainError('File kosong.', { file: 'File kosong.' });
  if (bytes.byteLength > MAX_RESTORE_BYTES) {
    const m = `File terlalu besar (maksimal ${MAX_RESTORE_BYTES / 1024 / 1024} MB).`;
    throw new DomainError(m, { file: m });
  }
  if (!Buffer.from(bytes.subarray(0, 16)).equals(SQLITE_MAGIC)) {
    const m = 'Bukan file database SQLite.';
    throw new DomainError(m, { file: m });
  }

  const dir = stagingDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  cleanStaging(dataDir, now.getTime());
  const token = crypto.randomUUID();
  const target = path.join(dir, `${token}.sqlite`);
  fs.writeFileSync(target, bytes);

  let candidate: DatabaseSync | null = null;
  const reject = (message: string): never => {
    // Windows cannot delete a file that is still open, so release the handle first.
    try {
      candidate?.close();
    } catch {
      // already closed
    }
    candidate = null;
    removeStagedFiles(target);
    throw new DomainError(message, { file: message });
  };

  try {
    candidate = new DatabaseSync(target, { readOnly: true });
    candidate.exec('PRAGMA trusted_schema = OFF');
    const integrity = (candidate.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]).map((r) => r.integrity_check);
    if (integrity.length !== 1 || integrity[0] !== 'ok') return reject('File database rusak (integrity check gagal).');

    const tables = new Set((candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
    if (!tables.has('schema_migrations') || !tables.has('episodes') || !tables.has('metric_snapshots')) {
      return reject('Ini bukan cadangan SignalForge (tabel yang diharapkan tidak ada).');
    }
    const version = currentSchemaVersionReadOnly(candidate);
    if (version > MIGRATIONS.length) return reject(`Cadangan berasal dari versi SignalForge yang lebih baru (skema v${version} > v${MIGRATIONS.length}).`);

    const expected = expectedSchemaObjects();
    const objects = candidate.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('trigger','view')").all() as { name: string; sql: string }[];
    for (const o of objects) {
      if (expected.get(o.name) !== o.sql) return reject('Cadangan memuat trigger/view yang tidak dikenal dan ditolak demi keamanan.');
    }
    candidate.close();
    candidate = null;

    // Upgrade the STAGED COPY to the current schema; the live database is untouched until confirmation.
    const upgraded = openDatabase(target);
    try {
      upgraded.exec('PRAGMA trusted_schema = OFF');
      upgraded.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      return {
        token,
        summary: {
          schemaVersion: MIGRATIONS.length,
          willMigrateFrom: version < MIGRATIONS.length ? version : null,
          episodes: count(upgraded, 'episodes'),
          distributions: count(upgraded, 'distributions'),
          snapshots: count(upgraded, 'metric_snapshots'),
          experiments: count(upgraded, 'experiments'),
        },
      };
    } finally {
      upgraded.close();
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    return reject('File tidak dapat dibaca sebagai database SignalForge.');
  } finally {
    candidate?.close();
  }
}

function currentSchemaVersionReadOnly(db: DatabaseSync): number {
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as { v: number };
  return Number(row.v);
}

// --- restore: apply ---

export interface RestoreResult {
  preRestoreBackup: BackupFile;
  restored: { episodes: number; distributions: number; snapshots: number; experiments: number };
}

/**
 * Replaces the application data with the staged, validated copy. Always writes a pre-restore backup first;
 * the copy happens in ONE transaction, so a failure leaves the current data exactly as it was.
 */
export function restoreFromStaged(db: DatabaseSync, dataDir: string, backupDir: string, token: string): RestoreResult {
  const staged = stagingPath(dataDir, token);
  if (!staged || !fs.existsSync(staged)) {
    throw new DomainError('Berkas pemulihan tidak ditemukan atau sudah kedaluwarsa. Unggah ulang cadangan.');
  }
  const preRestoreBackup = createBackup(db, backupDir, 'pre-restore');

  db.prepare('ATTACH DATABASE ? AS restore_src').run(staged);
  try {
    inTransaction(db, () => {
      db.exec('PRAGMA defer_foreign_keys = ON');
      for (const table of [...RESTORE_ORDER].reverse()) db.exec(`DELETE FROM main.${table}`);
      for (const table of RESTORE_ORDER) {
        const cols = (db.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map((c) => c.name).join(', ');
        db.exec(`INSERT INTO main.${table} (${cols}) SELECT ${cols} FROM restore_src.${table}`);
      }
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      if (violations.length > 0) throw new DomainError('Cadangan melanggar integritas relasi; pemulihan dibatalkan dan data saat ini tidak berubah.');
    });
  } catch (error) {
    throw error instanceof DomainError
      ? error
      : new DomainError('Pemulihan gagal dan dibatalkan; data saat ini tidak berubah. Cadangan pra-pemulihan tersedia di daftar cadangan.');
  } finally {
    db.exec('DETACH DATABASE restore_src');
  }
  removeStagedFiles(staged);

  return {
    preRestoreBackup,
    restored: {
      episodes: count(db, 'episodes'),
      distributions: count(db, 'distributions'),
      snapshots: count(db, 'metric_snapshots'),
      experiments: count(db, 'experiments'),
    },
  };
}

/** Counts inside an already-validated staged copy (read-only), for the confirmation screen. Null if it is gone. */
export function readStagedCounts(
  dataDir: string,
  token: string,
): { episodes: number; distributions: number; snapshots: number; experiments: number } | null {
  const staged = stagingPath(dataDir, token);
  if (!staged || !fs.existsSync(staged)) return null;
  const copy = new DatabaseSync(staged, { readOnly: true });
  try {
    return {
      episodes: count(copy, 'episodes'),
      distributions: count(copy, 'distributions'),
      snapshots: count(copy, 'metric_snapshots'),
      experiments: count(copy, 'experiments'),
    };
  } finally {
    copy.close();
  }
}

export function discardStaged(dataDir: string, token: string): void {
  const staged = stagingPath(dataDir, token);
  if (staged) removeStagedFiles(staged);
}

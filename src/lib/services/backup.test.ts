import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../domain/errors';
import { openDatabase } from '../db/open';
import { MIGRATIONS } from '../db/migrations';
import { addDist, snap } from '@/test/helpers';
import {
  MAX_RESTORE_BYTES,
  createBackup,
  discardStaged,
  listBackups,
  resolveBackupPath,
  restoreFromStaged,
  stageRestoreFile,
  stagingPath,
} from './backup';
import { updateAppSettings } from './settings';

let dir: string;
let backupDir: string;
const opened: DatabaseSync[] = [];
const open = (name: string, opts: Parameters<typeof openDatabase>[1] = {}) => {
  const db = openDatabase(path.join(dir, name), opts);
  opened.push(db);
  return db;
};
const count = (db: DatabaseSync, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-backup-'));
  backupDir = path.join(dir, 'backups');
});
afterEach(() => {
  for (const db of opened.splice(0)) {
    try {
      db.close();
    } catch {
      // already closed by the test
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function populated(name = 'source.sqlite') {
  const db = open(name);
  const a = addDist(db, 'Episode Sumber', 'youtube', '2026-10-01T10:00');
  snap(db, a.distributionId, '2026-10-02T10:00', { mdef_views: '0', mdef_ctr: '12,5' });
  updateAppSettings(db, { timezone: 'Asia/Taipei', comparisonWindows: [{ hours: 48, toleranceHours: 12 }] });
  return { db, ...a };
}

describe('manual backups', () => {
  it('creates a consistent, openable copy and lists it', () => {
    const { db } = populated();
    const b = createBackup(db, backupDir);
    expect(b).toMatchObject({ kind: 'manual' });
    expect(b.sizeBytes).toBeGreaterThan(0);
    expect(listBackups(backupDir).map((x) => x.name)).toEqual([b.name]);
    const copy = new DatabaseSync(path.join(backupDir, b.name), { readOnly: true });
    expect(count(copy, 'episodes')).toBe(1);
    expect((copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');
    copy.close();
  });

  it('only resolves plain backup file names inside the backup directory', () => {
    const { db } = populated();
    const b = createBackup(db, backupDir);
    fs.writeFileSync(path.join(dir, 'secret.sqlite'), 'x');
    expect(resolveBackupPath(backupDir, b.name)).toBe(path.join(backupDir, b.name));
    for (const bad of ['../secret.sqlite', '..\\secret.sqlite', 'secret.txt', '', 'nope.sqlite', '/etc/passwd', 'a/b.sqlite', path.join(dir, 'secret.sqlite')]) {
      expect(resolveBackupPath(backupDir, bad), bad).toBeNull();
    }
  });

  it('lists nothing when no backup exists', () => {
    expect(listBackups(backupDir)).toEqual([]);
  });
});

describe('restore', () => {
  it('restores data and settings from a backup, after writing a pre-restore backup of the current data', () => {
    const { db: source } = populated();
    const backup = createBackup(source, backupDir);
    source.close();

    const target = open('target.sqlite');
    addDist(target, 'Episode Lain', 'tiktok', '2026-09-01T10:00');
    expect(count(target, 'episodes')).toBe(1);

    const bytes = fs.readFileSync(path.join(backupDir, backup.name));
    const { token, summary } = stageRestoreFile(dir, bytes);
    expect(summary).toMatchObject({ episodes: 1, distributions: 1, snapshots: 1, willMigrateFrom: null, schemaVersion: MIGRATIONS.length });

    const result = restoreFromStaged(target, dir, backupDir, token);
    expect(result.restored).toMatchObject({ episodes: 1, snapshots: 1 });
    expect((target.prepare('SELECT title FROM episodes').get() as { title: string }).title).toBe('Episode Sumber');
    expect((target.prepare("SELECT value FROM app_settings WHERE key = 'timezone'").get() as { value: string }).value).toBe('Asia/Taipei');
    // zero stays zero, ratio stays a fraction
    expect(target.prepare("SELECT m.key AS k, v.numeric_value AS n FROM metric_values v JOIN metric_definitions m ON m.id = v.metric_definition_id ORDER BY m.key").all().map((r) => ({ ...r }))).toEqual([
      { k: 'click_through_rate', n: 0.125 },
      { k: 'views', n: 0 },
    ]);
    expect((target.prepare('PRAGMA foreign_key_check').all()).length).toBe(0);
    expect((target.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');

    // The pre-restore backup holds the data that was replaced.
    expect(result.preRestoreBackup.kind).toBe('pre-restore');
    const before = new DatabaseSync(path.join(backupDir, result.preRestoreBackup.name), { readOnly: true });
    expect((before.prepare('SELECT title FROM episodes').get() as { title: string }).title).toBe('Episode Lain');
    before.close();
    expect(fs.existsSync(stagingPath(dir, token)!)).toBe(false); // staging is cleaned up
  });

  it('keeps append-only protection and the schema intact after a restore', () => {
    const { db: source, distributionId } = populated();
    const backup = createBackup(source, backupDir);
    const target = open('target.sqlite');
    const { token } = stageRestoreFile(dir, fs.readFileSync(path.join(backupDir, backup.name)));
    restoreFromStaged(target, dir, backupDir, token);
    expect(() => target.prepare('UPDATE metric_snapshots SET note = ?').run('x')).toThrow(/append-only/);
    snap(target, distributionId, '2026-10-03T10:00', { mdef_views: '5' }); // the app keeps working on the restored data
    expect(count(target, 'metric_snapshots')).toBe(2);
  });

  it('upgrades an older backup to the current schema (on a staged copy) before restoring', () => {
    const old = open('old.sqlite', { upTo: 3 });
    // A v3 database has no import_job_id column, so populate it with plain SQL (current services target v5).
    old.exec(`
      INSERT INTO episodes (id, title, created_at, updated_at) VALUES ('e1', 'Dari Skema Lama', 't', 't');
      INSERT INTO distributions (id, episode_id, platform_id, status, published_at, created_at, updated_at)
        VALUES ('d1', 'e1', 'facebook', 'published', '2026-10-01T03:00:00.000Z', 't', 't');
      INSERT INTO metric_snapshots (id, distribution_id, captured_at, post_age_seconds, source, created_at)
        VALUES ('s1', 'd1', '2026-10-02T03:00:00.000Z', 86400, 'manual', 't');
      INSERT INTO metric_values (snapshot_id, metric_definition_id, numeric_value, value_state) VALUES ('s1', 'mdef_views', 7, 'known');`);
    old.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(path.join(dir, 'old.sqlite'));
    old.close();

    const target = open('target.sqlite');
    const { token, summary } = stageRestoreFile(dir, bytes);
    expect(summary.willMigrateFrom).toBe(3);
    restoreFromStaged(target, dir, backupDir, token);
    expect((target.prepare('SELECT title FROM episodes').get() as { title: string }).title).toBe('Dari Skema Lama');
    expect(count(target, 'experiments')).toBe(0);
    expect(count(target, 'import_jobs')).toBe(0);
  });

  it('restores experiments, links and the decision log', () => {
    const { db: source } = populated();
    source.exec(`
      INSERT INTO experiments (id, title, hypothesis, variable_to_test, design, primary_metric_definition_id, comparison_window_hours,
        comparison_tolerance_hours, success_type, success_value, status, created_at, updated_at)
        VALUES ('x1','Exp','H','V','concurrent','mdef_views',24,6,'min_value',10,'draft','t','t');
      INSERT INTO experiment_events (id, experiment_id, kind, to_status, note, created_at) VALUES ('ev1','x1','created','draft','n','t');`);
    const backup = createBackup(source, backupDir);
    const target = open('target.sqlite');
    const { token } = stageRestoreFile(dir, fs.readFileSync(path.join(backupDir, backup.name)));
    restoreFromStaged(target, dir, backupDir, token);
    expect(count(target, 'experiments')).toBe(1);
    expect(count(target, 'experiment_events')).toBe(1);
  });

  it('rolls back completely if the restore fails midway; current data is untouched', () => {
    const { db: source } = populated();
    const backup = createBackup(source, backupDir);
    const target = open('target.sqlite');
    addDist(target, 'Data Saat Ini', 'tiktok', '2026-09-01T10:00');
    const { token } = stageRestoreFile(dir, fs.readFileSync(path.join(backupDir, backup.name)));
    target.exec("CREATE TRIGGER boom BEFORE INSERT ON metric_values BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    expect(() => restoreFromStaged(target, dir, backupDir, token)).toThrow(/data saat ini tidak berubah/);
    expect((target.prepare('SELECT title FROM episodes').get() as { title: string }).title).toBe('Data Saat Ini');
    expect(count(target, 'distributions')).toBe(1);
    expect(() => target.prepare('SELECT 1 FROM restore_src.episodes').get()).toThrow(); // detached
  });

  it('rejects an unknown or malformed staging token', () => {
    const target = open('target.sqlite');
    expect(() => restoreFromStaged(target, dir, backupDir, '../../etc/passwd')).toThrow(DomainError);
    expect(() => restoreFromStaged(target, dir, backupDir, crypto.randomUUID())).toThrow(/tidak ditemukan/);
    expect(stagingPath(dir, 'not-a-token')).toBeNull();
    expect(() => discardStaged(dir, '../x')).not.toThrow();
  });
});

describe('restore file validation', () => {
  const stage = (bytes: Uint8Array) => () => stageRestoreFile(dir, bytes);

  it('rejects empty, oversized and non-SQLite files before writing anything dangerous', () => {
    expect(stage(new Uint8Array(0))).toThrow(/kosong/);
    expect(stage(new Uint8Array(MAX_RESTORE_BYTES + 1))).toThrow(/terlalu besar/);
    expect(stage(new TextEncoder().encode('id,name\n1,a\n'))).toThrow(/Bukan file database SQLite/);
    expect(fs.existsSync(path.join(dir, 'restore-tmp')) ? fs.readdirSync(path.join(dir, 'restore-tmp')) : []).toEqual([]);
  });

  it('rejects a damaged SQLite file', () => {
    const { db } = populated();
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(path.join(dir, 'source.sqlite'));
    db.close();
    const corrupted = new Uint8Array(bytes);
    for (let i = 4096; i < Math.min(corrupted.length, 4096 * 2); i++) corrupted[i] = 0xff;
    expect(stage(corrupted)).toThrow(/rusak|tidak dapat dibaca/);
    expect(fs.readdirSync(path.join(dir, 'restore-tmp'))).toEqual([]); // rejected files are removed
  });

  it('rejects a valid SQLite file that is not a SignalForge backup', () => {
    const other = new DatabaseSync(path.join(dir, 'other.sqlite'));
    other.exec('CREATE TABLE notes (id INTEGER); INSERT INTO notes VALUES (1);');
    other.close();
    expect(stage(fs.readFileSync(path.join(dir, 'other.sqlite')))).toThrow(/bukan cadangan SignalForge/i);
  });

  it('rejects a backup from a newer schema version', () => {
    const { db } = populated();
    db.prepare("INSERT INTO schema_migrations VALUES (?, 'future', 'now')").run(MIGRATIONS.length + 1);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(path.join(dir, 'source.sqlite'));
    db.close();
    expect(stage(bytes)).toThrow(/versi SignalForge yang lebih baru/);
  });

  it('rejects a backup carrying a trigger or view the app did not create', () => {
    const { db } = populated();
    db.exec("CREATE TRIGGER evil AFTER INSERT ON episodes BEGIN DELETE FROM episodes; END;");
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(path.join(dir, 'source.sqlite'));
    db.close();
    expect(stage(bytes)).toThrow(/trigger\/view yang tidak dikenal/);

    const { db: db2 } = populated('source2.sqlite');
    db2.exec('CREATE VIEW sneaky AS SELECT * FROM episodes');
    db2.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes2 = fs.readFileSync(path.join(dir, 'source2.sqlite'));
    db2.close();
    expect(stage(bytes2)).toThrow(/trigger\/view yang tidak dikenal/);
  });

  it('rejects a backup whose own append-only trigger was tampered with', () => {
    const { db } = populated();
    db.exec('DROP TRIGGER metric_snapshots_append_only');
    db.exec("CREATE TRIGGER metric_snapshots_append_only BEFORE UPDATE ON metric_snapshots BEGIN SELECT 1; END;");
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(path.join(dir, 'source.sqlite'));
    db.close();
    expect(stage(bytes)).toThrow(/tidak dikenal/);
  });
});

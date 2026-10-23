import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertMigrationsValid, currentSchemaVersion, migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { openDatabase } from './open';
import { inTransaction } from './tx';

const tables = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );

describe('migrations', () => {
  it('are contiguous', () => {
    expect(() => assertMigrationsValid(MIGRATIONS)).not.toThrow();
    expect(() => assertMigrationsValid([{ ...MIGRATIONS[1]!, version: 2 }])).toThrow(/contiguous/);
  });

  it('build the full schema on an empty database and seed platforms/metrics', () => {
    const db = openDatabase(':memory:');
    expect(currentSchemaVersion(db)).toBe(MIGRATIONS.length);
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'app_settings',
        'platforms',
        'episodes',
        'tags',
        'episode_tags',
        'distributions',
        'metric_definitions',
        'metric_snapshots',
        'metric_values',
        'schema_migrations',
      ]),
    );
    const platforms = db.prepare('SELECT id FROM platforms ORDER BY id').all() as { id: string }[];
    expect(platforms.map((p) => p.id)).toEqual(['facebook', 'tiktok', 'youtube']);
    const defs = db.prepare('SELECT COUNT(*) AS n FROM metric_definitions').get() as { n: number };
    expect(defs.n).toBeGreaterThanOrEqual(10);
  });

  it('is idempotent when re-run', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db, MIGRATIONS).applied).toEqual([]);
  });

  it('upgrades from the previous schema version', () => {
    const db = openDatabase(':memory:', { upTo: 2 });
    expect(currentSchemaVersion(db)).toBe(2);
    db.prepare(
      "INSERT INTO episodes (id, title, created_at, updated_at) VALUES ('e1','Existing','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
    ).run();
    const result = migrate(db, MIGRATIONS);
    expect(result).toMatchObject({ from: 2, to: 3, applied: [3] });
    expect((db.prepare('SELECT title FROM episodes').get() as { title: string }).title).toBe('Existing');
  });

  it('refuses a database newer than the app', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO schema_migrations VALUES (99, 'future', 'now')").run();
    expect(() => migrate(db, MIGRATIONS)).toThrow(/newer than this app/);
  });

  it('rolls back a failing migration entirely', () => {
    const db = openDatabase(':memory:', { upTo: 1 });
    const bad = [
      ...MIGRATIONS.slice(0, 1),
      { version: 2, name: 'bad', up: 'CREATE TABLE ok_table (a); THIS IS NOT SQL;' },
    ];
    expect(() => migrate(db, bad)).toThrow();
    expect(currentSchemaVersion(db)).toBe(1);
    expect(tables(db)).not.toContain('ok_table');
  });

  it('writes a backup before migrating an existing file database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-mig-'));
    try {
      const file = path.join(dir, 'db.sqlite');
      const backupDir = path.join(dir, 'backups');
      openDatabase(file, { upTo: 2, backupDir }).close();
      expect(fs.existsSync(backupDir)).toBe(false); // fresh DB: nothing to back up
      openDatabase(file, { backupDir }).close();
      const backups = fs.readdirSync(backupDir);
      expect(backups).toHaveLength(1);
      expect(backups[0]).toMatch(/^pre-migrate-v2-.*\.sqlite$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('inTransaction', () => {
  it('commits on success and rolls back on error, including nested savepoints', () => {
    const db = openDatabase(':memory:');
    const add = (id: string) =>
      db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, 'x')").run(id, id);
    const count = () => (db.prepare('SELECT COUNT(*) AS n FROM tags').get() as { n: number }).n;

    inTransaction(db, () => add('a'));
    expect(count()).toBe(1);

    expect(() =>
      inTransaction(db, () => {
        add('b');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(count()).toBe(1);

    inTransaction(db, () => {
      add('c');
      expect(() =>
        inTransaction(db, () => {
          add('d');
          throw new Error('inner');
        }),
      ).toThrow('inner');
    });
    expect(count()).toBe(2); // a, c — inner 'd' rolled back, outer 'c' kept
  });
});

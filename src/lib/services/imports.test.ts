import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { toCsv } from '../csv/csv';
import { CSV_COLUMNS, type CsvColumn } from '../csv/format';
import { DomainError } from '../domain/errors';
import { getImportJob, getImportContent } from '../repositories/imports';
import { createMetricDefinition } from './metric-definitions';
import { getDistributionTimeline } from './snapshots';
import { addDist, NOW, snap, testDb, TZ } from '@/test/helpers';
import { exportSnapshotsCsv, templateCsv } from './exports';
import {
  cancelImport,
  commitImport,
  errorsToCsv,
  getImportPreview,
  planImport,
  sanitizeFileName,
  stageImport,
} from './imports';

type Row = Partial<Record<CsvColumn, string>>;
const csv = (rows: Row[]) => toCsv([[...CSV_COLUMNS], ...rows.map((r) => CSV_COLUMNS.map((c) => r[c] ?? (c === 'schema_version' ? '1' : '')))]);
const enc = (s: string) => new TextEncoder().encode(s);

/** A valid measurement row; override fields per test. */
const m = (o: Row = {}): Row => ({
  episode_code: 'EP-1',
  episode_title: 'Judul Satu',
  platform: 'youtube',
  published_at: '2026-10-01T10:00:00+07:00',
  captured_at: '2026-10-02T10:00:00+07:00',
  metric_key: 'views',
  value_state: 'known',
  value: '100',
  ...o,
});

const plan = (db: DatabaseSync, rows: Row[]) => planImport(db, csv(rows), TZ, NOW);
const errorsOf = (db: DatabaseSync, rows: Row[]) => plan(db, rows).errors.map((e) => `${e.line}:${e.column ?? '-'}`);

function stageAndCommit(db: DatabaseSync, rows: Row[], opts: Partial<Parameters<typeof commitImport>[2]> = {}) {
  const jobId = stageImport(db, { name: 'data.csv', bytes: enc(csv(rows)) }, TZ, NOW);
  return { jobId, result: commitImport(db, jobId, { duplicatePolicy: 'skip', allowPartial: false, ...opts }, TZ, NOW) };
}

const count = (db: DatabaseSync, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('template and header', () => {
  it('the downloadable template imports cleanly (examples are marked as samples)', () => {
    const db = testDb();
    const p = planImport(db, templateCsv(), TZ, NOW);
    expect(p.errors).toEqual([]);
    expect(p.summary).toMatchObject({ newEpisodes: 1, newDistributions: 1, snapshotsToCreate: 1, valueRows: 4 });
    expect(p.episodes[0]!.title).toContain('[CONTOH]');
  });

  it('rejects files whose header does not match the template', () => {
    const db = testDb();
    expect(() => planImport(db, 'a,b\n1,2\n', TZ, NOW)).toThrow(/Header CSV tidak sesuai/);
    const withoutValue = toCsv([CSV_COLUMNS.filter((c) => c !== 'value'), ['1']]);
    expect(() => planImport(db, withoutValue, TZ, NOW)).toThrow(/Kolom wajib tidak ada: "value"/);
    const extra = toCsv([[...CSV_COLUMNS, 'password'], [...CSV_COLUMNS.map(() => ''), 'x']]);
    expect(() => planImport(db, extra, TZ, NOW)).toThrow(/Kolom tidak dikenal/);
    expect(() => planImport(db, toCsv([[...CSV_COLUMNS, 'note'], []]), TZ, NOW)).toThrow(/lebih dari sekali/);
  });

  it('rejects an unsupported schema_version per row', () => {
    expect(errorsOf(testDb(), [m({ schema_version: '2' })])).toEqual(['2:schema_version']);
  });
});

describe('row validation', () => {
  const db = testDb();

  it.each<[string, Row, string]>([
    ['unknown platform', { platform: 'instagram' }, 'platform'],
    ['no episode identity', { episode_code: '', episode_title: '' }, 'episode_code'],
    ['bad episode code', { episode_code: 'EP 1' }, 'episode_code'],
    ['unknown metric key', { metric_key: 'vibes' }, 'metric_key'],
    ['counter with decimals', { value: '1.5' }, 'value'],
    ['negative counter', { value: '-3' }, 'value'],
    ['ratio above 100%', { metric_key: 'click_through_rate', unit: 'ratio', value: '150' }, 'value'],
    ['thousands separator', { value: '1,234' }, 'value'],
    ['unit mismatch', { unit: 'seconds' }, 'unit'],
    ['blank value for known (blank is unknown, not 0)', { value: '' }, 'value'],
    ['value given for not_available', { value_state: 'not_available', value: '5' }, 'value'],
    ['"unknown" is not a writable state', { value_state: 'unknown' }, 'value_state'],
    ['bad post url scheme', { post_url: 'javascript:alert(1)' }, 'post_url'],
    ['impossible date', { captured_at: '2026-02-30T10:00:00Z' }, 'captured_at'],
    ['future capture', { captured_at: '2027-01-01T10:00:00Z' }, 'captured_at'],
    ['capture before publication', { captured_at: '2026-09-30T10:00:00+07:00' }, 'captured_at'],
    ['metric without captured_at', { captured_at: '' }, 'captured_at'],
    ['captured_at without metric', { metric_key: '' }, 'metric_key'],
    ['control character', { episode_title: 'bad\u0007title' }, 'episode_title'],
  ])('%s', (_name, override, column) => {
    const p = plan(db, [m(override)]);
    expect(p.errors.map((e) => e.column)).toContain(column);
    expect(p.rejectedRows).toBe(1);
    expect(p.summary.snapshotsToCreate).toBe(0);
  });

  it('reports a wrong number of cells and keeps the line numbers of the file', () => {
    const text = csv([m()]) + 'only,three,cells\r\n' + csv([m({ metric_key: 'likes', value: '3' })]).split('\r\n')[1] + '\r\n';
    const p = planImport(db, text, TZ, NOW);
    expect(p.errors).toEqual([expect.objectContaining({ line: 3, message: expect.stringMatching(/Jumlah kolom/) })]);
  });

  it('never echoes cell contents in error messages', () => {
    const secret = 'SUPER-SECRET-TOKEN-123';
    const p = plan(db, [m({ platform: secret, value: secret, unit: secret, captured_at: secret, post_url: secret, metric_key: secret })]);
    expect(p.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(p.errors)).not.toContain(secret);
    expect(errorsToCsv(p.errors)).not.toContain(secret);
  });

  it('treats formula-looking text as inert data and un-escapes the export guard', () => {
    const p = plan(testDb(), [m({ episode_title: "'=HYPERLINK(\"http://evil\",\"x\")", episode_code: '', note: "'=1+1" })]);
    expect(p.errors).toEqual([]);
    expect(p.episodes[0]!.title).toBe('=HYPERLINK("http://evil","x")');
    expect(p.distributions[0]!.snapshots[0]!.note).toBe('=1+1');
  });

  it('accepts local timestamps in the app time zone and counts them', () => {
    const p = plan(testDb(), [m({ published_at: '2026-10-01 10:00', captured_at: '2026-10-02 10:00' })]);
    expect(p.errors).toEqual([]);
    expect(p.assumedLocalTimeRows).toBe(1);
    expect(p.distributions[0]!.publishedAt).toBe('2026-10-01T03:00:00.000Z');
  });
});

describe('snapshots are all-or-nothing within the file', () => {
  it('drops a whole snapshot when any of its rows is invalid, and explains the skipped rows', () => {
    const db = testDb();
    const p = plan(db, [m({ metric_key: 'views', value: '100' }), m({ metric_key: 'likes', value: 'abc' }), m({ metric_key: 'shares', value: '5' })]);
    expect(p.summary.snapshotsToCreate).toBe(0);
    expect(p.rejectedRows).toBe(3);
    expect(p.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(p.errors.filter((e) => /Dilewati/.test(e.message))).toHaveLength(2);
  });

  it('flags a metric repeated within one snapshot and conflicting notes', () => {
    const db = testDb();
    // Line 2 is itself fine but is dropped with its snapshot ("2:-"); line 3 carries the actual error.
    expect(errorsOf(db, [m(), m({ value: '5' })])).toEqual(['2:-', '3:metric_key']);
    expect(errorsOf(db, [m({ note: 'a' }), m({ metric_key: 'likes', note: 'b' })])).toContain('3:note');
  });

  it('flags conflicting published_at for a new distribution', () => {
    const db = testDb();
    expect(errorsOf(db, [m(), m({ metric_key: 'likes', published_at: '2026-10-01T11:00:00+07:00' })])).toContain('3:published_at');
  });
});

describe('matching existing data', () => {
  it('reuses episodes by code and distributions by platform+variant; existing data is not modified', () => {
    const db = testDb();
    const a = addDist(db, 'Judul Asli', 'youtube', '2026-10-01T10:00');
    db.prepare("UPDATE episodes SET episode_code = 'EP-1' WHERE id = ?").run(a.episodeId);
    const p = plan(db, [m({ episode_title: 'Judul berbeda di CSV', published_at: '2026-10-05T10:00:00+07:00' })]);
    expect(p.errors).toEqual([]);
    expect(p.summary).toMatchObject({ newEpisodes: 0, reusedEpisodes: 1, newDistributions: 0, reusedDistributions: 1 });
    expect(p.warnings.join(' ')).toMatch(/published_at pada baris 2 berbeda/);
    stageAndCommit(db, [m({ episode_title: 'Judul berbeda di CSV', published_at: '2026-10-05T10:00:00+07:00' })]);
    expect((db.prepare('SELECT title FROM episodes WHERE id = ?').get(a.episodeId) as { title: string }).title).toBe('Judul Asli');
    expect((db.prepare('SELECT published_at AS p FROM distributions WHERE id = ?').get(a.distributionId) as { p: string }).p).toBe('2026-10-01T03:00:00.000Z');
  });

  it('matches episodes by exact title (case-insensitive) when no code is given, and refuses ambiguous titles', () => {
    const db = testDb();
    addDist(db, 'Satu Judul', 'youtube', '2026-10-01T10:00');
    expect(plan(db, [m({ episode_code: '', episode_title: 'satu judul' })]).summary.reusedEpisodes).toBe(1);
    addDist(db, 'Satu Judul', 'tiktok', '2026-10-01T10:00'); // a second episode with the same title
    expect(errorsOf(db, [m({ episode_code: '', episode_title: 'SATU JUDUL' })])).toContain('2:episode_title');
  });

  it('merges title-only rows into a coded new episode of the same title instead of creating two', () => {
    const p = plan(testDb(), [m({ episode_code: 'EP-9', episode_title: 'Baru' }), m({ episode_code: '', episode_title: 'Baru', metric_key: 'likes', value: '3' })]);
    expect(p.errors).toEqual([]);
    expect(p.episodes).toHaveLength(1);
    expect(p.summary.snapshotsToCreate).toBe(1);
  });

  it('requires a title to create a new episode', () => {
    expect(errorsOf(testDb(), [m({ episode_title: '' })])).toContain('2:episode_title');
  });

  it('keeps metrics scoped to platforms', () => {
    const db = testDb();
    createMetricDefinition(db, {
      key: 'finish_rate', label: 'Finish', unit: 'ratio', description: null, aggregationKind: 'ratio', currencyCode: null,
      platformId: 'tiktok', allowNegative: false, sourceDefinition: null, formulaVersion: null,
    });
    expect(errorsOf(db, [m({ platform: 'youtube', metric_key: 'finish_rate', value: '50' })])).toEqual(['2:metric_key']);
    expect(errorsOf(db, [m({ platform: 'tiktok', metric_key: 'finish_rate', value: '50' })])).toEqual([]);
  });
});

describe('committing', () => {
  it('writes episodes, distributions, snapshots and values with provenance, and keeps zero distinct from missing', () => {
    const db = testDb();
    const { jobId, result } = stageAndCommit(db, [
      m({ metric_key: 'views', value: '0' }),
      m({ metric_key: 'click_through_rate', unit: 'ratio', value: '12,5' }),
      m({ metric_key: 'saves', value_state: 'not_available', value: '' }),
      m({ metric_key: 'followers_gained', value: '-4' }),
      m({ captured_at: '', metric_key: '', value_state: '', value: '', episode_code: 'EP-2', episode_title: 'Hanya Struktur', platform: 'tiktok', published_at: '' }),
    ]);
    expect(result).toMatchObject({ episodesCreated: 2, distributionsCreated: 2, snapshotsCreated: 1, rowsRejected: 0 });

    const snapshot = db.prepare('SELECT source, import_job_id AS job, post_age_seconds AS age FROM metric_snapshots').get() as { source: string; job: string; age: number };
    expect(snapshot).toEqual({ source: 'csv_import', job: jobId, age: 86400 });
    const values = db.prepare("SELECT m.key AS key, v.value_state AS state, v.numeric_value AS n FROM metric_values v JOIN metric_definitions m ON m.id = v.metric_definition_id ORDER BY m.key").all().map((r) => ({ ...r }));
    expect(values).toEqual([
      { key: 'click_through_rate', state: 'known', n: 0.125 },
      { key: 'followers_gained', state: 'known', n: -4 },
      { key: 'saves', state: 'not_available', n: null },
      { key: 'views', state: 'known', n: 0 },
    ]);
    const structure = db.prepare("SELECT status, published_at AS p FROM distributions d JOIN episodes e ON e.id = d.episode_id WHERE e.episode_code = 'EP-2'").get() as { status: string; p: string | null };
    expect(structure).toEqual({ status: 'unknown', p: null });
  });

  it('is all-or-nothing by default: any rejected row blocks the import and nothing is written', () => {
    const db = testDb();
    const jobId = stageImport(db, { name: 'x.csv', bytes: enc(csv([m(), m({ episode_code: 'EP-2', value: 'abc' })])) }, TZ, NOW);
    expect(getImportJob(db, jobId)).toMatchObject({ status: 'previewed', rowsTotal: 2, rowsValid: 1, rowsRejected: 1 });
    expect(() => commitImport(db, jobId, { duplicatePolicy: 'skip', allowPartial: false }, TZ, NOW)).toThrow(/baris yang ditolak/);
    expect(count(db, 'episodes') + count(db, 'distributions') + count(db, 'metric_snapshots')).toBe(0);
    expect(getImportJob(db, jobId)!.status).toBe('previewed'); // still fixable
  });

  it('with allowPartial imports only the valid snapshots and records how many rows were rejected', () => {
    const db = testDb();
    const { jobId, result } = stageAndCommit(db, [m(), m({ episode_code: 'EP-2', episode_title: 'Dua', value: 'abc' })], { allowPartial: true });
    expect(result).toMatchObject({ snapshotsCreated: 1, rowsRejected: 1 });
    expect(getImportJob(db, jobId)).toMatchObject({ status: 'committed', rowsRejected: 1, snapshotsCreated: 1 });
    expect(getImportJob(db, jobId)!.errorSummary).toMatch(/Baris 3/);
    expect(count(db, 'episodes')).toBe(1); // the rejected episode was not created
  });

  it('rolls everything back if the database fails midway, and marks the job failed', () => {
    const db = testDb();
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON metric_values WHEN NEW.numeric_value = 777 BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    const rows = [m({ value: '5' }), m({ episode_code: 'EP-2', episode_title: 'Dua', value: '777' })];
    const jobId = stageImport(db, { name: 'x.csv', bytes: enc(csv(rows)) }, TZ, NOW);
    expect(() => commitImport(db, jobId, { duplicatePolicy: 'skip', allowPartial: false }, TZ, NOW)).toThrow(/dibatalkan/);
    expect(count(db, 'episodes') + count(db, 'distributions') + count(db, 'metric_snapshots') + count(db, 'metric_values')).toBe(0);
    expect(getImportJob(db, jobId)).toMatchObject({ status: 'failed' });
    expect(getImportContent(db, jobId)).toBeNull();
  });

  it('clears the staged CSV when the job finishes or is cancelled (imported records are not retained)', () => {
    const db = testDb();
    const { jobId } = stageAndCommit(db, [m()]);
    expect(getImportContent(db, jobId)).toBeNull();
    const second = stageImport(db, { name: 'y.csv', bytes: enc(csv([m({ episode_code: 'EP-3', episode_title: 'Tiga' })])) }, TZ, NOW);
    expect(getImportContent(db, second)).not.toBeNull();
    cancelImport(db, second);
    expect(getImportContent(db, second)).toBeNull();
    expect(() => getImportPreview(db, second, TZ, NOW)).toThrow(DomainError);
    expect(() => commitImport(db, second, { duplicatePolicy: 'skip', allowPartial: false }, TZ, NOW)).toThrow(/selesai atau kedaluwarsa/);
  });

  it('expires previews older than a day', () => {
    const db = testDb();
    const old = stageImport(db, { name: 'old.csv', bytes: enc(csv([m()])) }, TZ, NOW);
    stageImport(db, { name: 'new.csv', bytes: enc(csv([m({ episode_code: 'EP-9', episode_title: 'X' })])) }, TZ, new Date(NOW.getTime() + 26 * 3600 * 1000));
    expect(getImportJob(db, old)).toMatchObject({ status: 'cancelled' });
    expect(getImportContent(db, old)).toBeNull();
  });

  it('refuses to commit a job twice', () => {
    const db = testDb();
    const { jobId } = stageAndCommit(db, [m()]);
    expect(() => commitImport(db, jobId, { duplicatePolicy: 'skip', allowPartial: false }, TZ, NOW)).toThrow(DomainError);
    expect(count(db, 'metric_snapshots')).toBe(1);
  });
});

describe('duplicates', () => {
  function seedExisting() {
    const db = testDb();
    const a = addDist(db, 'Judul Satu', 'youtube', '2026-10-01T10:00');
    db.prepare("UPDATE episodes SET episode_code = 'EP-1' WHERE id = ?").run(a.episodeId);
    const original = snap(db, a.distributionId, '2026-10-02T10:00', { mdef_views: '100' });
    return { db, a, original };
  }

  it('detects a snapshot at the same instant and skips it by default', () => {
    const { db } = seedExisting();
    const p = plan(db, [m({ value: '999' })]);
    expect(p.summary).toMatchObject({ snapshotsToCreate: 0, duplicateSnapshots: 1 });
    expect(() => stageAndCommit(db, [m({ value: '999' })])).toThrow(/Tidak ada yang bisa diimpor/);
    expect(count(db, 'metric_snapshots')).toBe(1);
  });

  it('can supersede the existing snapshot instead; the original stays as history', () => {
    const { db, a, original } = seedExisting();
    const { result } = stageAndCommit(db, [m({ value: '999' })], { duplicatePolicy: 'supersede' });
    expect(result.snapshotsCreated).toBe(1);
    const t = getDistributionTimeline(db, a.distributionId);
    expect(t.snapshots).toHaveLength(2);
    expect(t.snapshots.find((s) => s.snapshot.id === original)!.supersededBy).not.toBeNull();
    expect(t.snapshots.find((s) => s.snapshot.id === original)!.values.get('mdef_views')!.numericValue).toBe(100);
  });

  it('imports new instants for an existing distribution while skipping the duplicate one', () => {
    const { db } = seedExisting();
    const { result } = stageAndCommit(db, [m({ value: '999' }), m({ captured_at: '2026-10-03T10:00:00+07:00', value: '150' })]);
    expect(result).toMatchObject({ snapshotsCreated: 1, duplicatesSkipped: 1 });
  });
});

describe('upload validation', () => {
  const stage = (name: string, bytes: Uint8Array) => () => stageImport(testDb(), { name, bytes }, TZ, NOW);

  it('accepts only non-empty UTF-8 .csv files within the size limit', () => {
    expect(stage('data.txt', enc('x'))).toThrow(/\.csv/);
    expect(stage('data.csv', new Uint8Array(0))).toThrow(/kosong/);
    expect(stage('data.csv', new Uint8Array([0xff, 0xfe, 0x00, 0xfa]))).toThrow(/UTF-8/);
    expect(stage('data.csv', new Uint8Array(2 * 1024 * 1024 + 1).fill(97))).toThrow(/terlalu besar/);
  });

  it('sanitizes file names (no paths, no odd characters)', () => {
    expect(sanitizeFileName('C:\\Users\\x\\..\\data.csv')).toBe('data.csv');
    expect(sanitizeFileName('../../etc/passwd.csv')).toBe('passwd.csv');
    expect(sanitizeFileName('we<ird>"name".csv')).toBe('we_ird__name_.csv');
    expect(sanitizeFileName('')).toBe('import.csv');
    expect(sanitizeFileName('a'.repeat(300) + '.csv').length).toBeLessThanOrEqual(120);
  });

  it('does not fetch URLs or follow paths: post_url is stored as text only', () => {
    const db = testDb();
    stageAndCommit(db, [m({ post_url: 'https://example.com/a?b=1' })]);
    expect((db.prepare('SELECT post_url AS u FROM distributions').get() as { u: string }).u).toBe('https://example.com/a?b=1');
  });
});

describe('export and round trip', () => {
  function seedRich() {
    const db = testDb();
    const a = addDist(db, '=HYPERLINK("http://evil")', 'youtube', '2026-10-01T10:00');
    snap(db, a.distributionId, '2026-10-02T10:00', { mdef_views: '0', mdef_ctr: '12,5', mdef_followers_gained: '-4' });
    const second = snap(db, a.distributionId, '2026-10-03T10:00', { mdef_views: '10' });
    snap(db, a.distributionId, '2026-10-03T10:05', { mdef_views: '11' }, second); // supersedes → only this one is exported
    const b = addDist(db, 'Tanpa snapshot', 'tiktok', null);
    db.prepare("UPDATE episodes SET episode_code = 'EP-B' WHERE id = ?").run(b.episodeId);
    return db;
  }

  it('exports template-compatible rows: numbers untouched, text cells protected, structure-only rows, no superseded data', () => {
    const csvText = exportSnapshotsCsv(seedRich());
    expect(csvText.split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(csvText).toContain("'=HYPERLINK(");
    expect(csvText).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect(csvText).toContain(',followers_gained,known,-4,'); // negative number not corrupted by the formula guard
    expect(csvText).toContain(',click_through_rate,known,12.5,ratio,'); // percent with a dot
    expect(csvText).toMatch(/EP-B,Tanpa snapshot,tiktok,,,,,,,,,/); // structure-only row
    expect(csvText).not.toMatch(/,views,known,10,/); // superseded
    expect(csvText).toMatch(/,views,known,11,/);
  });

  it('round-trips: export → import into an empty database → export is identical', () => {
    const first = seedRich();
    const csvText = exportSnapshotsCsv(first);

    const second = testDb();
    const jobId = stageImport(second, { name: 'roundtrip.csv', bytes: enc(csvText) }, TZ, NOW);
    expect(getImportPreview(second, jobId, TZ, NOW).plan.errors).toEqual([]);
    commitImport(second, jobId, { duplicatePolicy: 'skip', allowPartial: false }, TZ, NOW);

    expect(exportSnapshotsCsv(second)).toBe(csvText);
    // The imported distribution keeps zero distinct from missing and the ratio as a fraction.
    const v = (db: DatabaseSync, key: string) =>
      db.prepare("SELECT v.numeric_value AS n FROM metric_values v JOIN metric_definitions m ON m.id = v.metric_definition_id JOIN metric_snapshots s ON s.id = v.snapshot_id WHERE m.key = ? ORDER BY s.captured_at LIMIT 1").get(key) as { n: number } | undefined;
    expect(v(second, 'views')).toEqual({ n: 0 });
    expect(v(second, 'click_through_rate')).toEqual({ n: 0.125 });
    expect(v(second, 'likes')).toBeUndefined(); // never recorded → still no row
    // Post age is re-derived from the imported timestamps.
    expect((second.prepare('SELECT post_age_seconds AS a FROM metric_snapshots ORDER BY captured_at LIMIT 1').get() as { a: number }).a).toBe(86400);
  });

  it('filters exports by platform', () => {
    const csvText = exportSnapshotsCsv(seedRich(), { platformId: 'tiktok' });
    expect(csvText).toContain('Tanpa snapshot');
    expect(csvText).not.toContain('HYPERLINK');
  });

  it('exports an empty database as just the header', () => {
    expect(exportSnapshotsCsv(testDb())).toBe(CSV_COLUMNS.join(',') + '\r\n');
  });
});

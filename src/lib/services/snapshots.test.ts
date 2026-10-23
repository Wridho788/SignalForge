import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/errors';
import { createMetricDefinition } from './metric-definitions';
import { metricDefinitionCreateSchema } from '../validation/metric-definition';
import { parseInput } from '../validation/common';
import { formatMetricValue } from '../metrics/format';
import { NOW, seedDistribution, testDb, TZ } from '@/test/helpers';
import { deleteDistribution } from './distributions';
import {
  getDistributionTimeline,
  recordSnapshot,
  valueFieldName,
  type SnapshotEntryInput,
  type SnapshotInput,
} from './snapshots';
import type { DatabaseSync } from 'node:sqlite';

const VIEWS = 'mdef_views';
const LIKES = 'mdef_likes';
const CTR = 'mdef_ctr';

const entry = (id: string, raw: string, mode: SnapshotEntryInput['mode'] = 'value'): SnapshotEntryInput => ({
  metricDefinitionId: id,
  mode,
  raw,
});

const snap = (capturedAtLocal: string, entries: SnapshotEntryInput[], extra: Partial<SnapshotInput> = {}): SnapshotInput => ({
  capturedAtLocal,
  note: null,
  supersedesSnapshotId: null,
  entries,
  ...extra,
});

const ctx = { timezone: TZ, confirmWarnings: false, now: NOW };

function save(db: DatabaseSync, distributionId: string, input: SnapshotInput, confirm = false): string {
  const r = recordSnapshot(db, distributionId, input, { ...ctx, confirmWarnings: confirm });
  if (r.status !== 'saved') throw new Error(`expected saved, got ${JSON.stringify(r)}`);
  return r.snapshotId;
}

describe('recording snapshots', () => {
  it('keeps zero and unknown distinct end to end', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '0'), entry(LIKES, '')]));

    const rows = db.prepare('SELECT metric_definition_id AS id, numeric_value AS n, value_state AS s FROM metric_values').all();
    expect(rows).toHaveLength(1); // blank LIKES stored nothing
    expect({ ...rows[0] }).toEqual({ id: VIEWS, n: 0, s: 'known' });

    const timeline = getDistributionTimeline(db, distributionId);
    const views = timeline.metrics.find((m) => m.id === VIEWS)!;
    const values = timeline.snapshots[0]!.values;
    expect(formatMetricValue(views, values.get(VIEWS))).toMatchObject({ text: '0', known: true });

    // Likes was left blank: it is not a column, and is named explicitly as having no value.
    expect(timeline.metrics.some((m) => m.id === LIKES)).toBe(false);
    const likes = timeline.metricsWithoutValues.find((m) => m.id === LIKES)!;
    expect(formatMetricValue(likes, values.get(LIKES))).toMatchObject({ text: '—', known: false });

    // Once a later snapshot records likes, the earlier snapshot shows an unknown (—), not 0.
    save(db, distributionId, snap('2026-10-03T10:00', [entry(VIEWS, '5'), entry(LIKES, '2')]));
    const later = getDistributionTimeline(db, distributionId);
    const likesCol = later.metrics.find((m) => m.id === LIKES)!;
    expect(formatMetricValue(likesCol, later.snapshots[0]!.values.get(LIKES))).toMatchObject({ text: '—', known: false });
    expect(formatMetricValue(likesCol, later.snapshots[1]!.values.get(LIKES))).toMatchObject({ text: '2', known: true });
  });

  it('stores not_available / not_applicable with NULL values', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '10'), entry(LIKES, '', 'not_available'), entry(CTR, '', 'not_applicable')]));
    const states = db
      .prepare('SELECT metric_definition_id AS id, numeric_value AS n, text_value AS t, value_state AS s FROM metric_values ORDER BY id')
      .all()
      .map((r) => ({ ...r }));
    expect(states).toEqual([
      { id: CTR, n: null, t: null, s: 'not_applicable' },
      { id: LIKES, n: null, t: null, s: 'not_available' },
      { id: VIEWS, n: 10, t: null, s: 'known' },
    ]);
  });

  it('rejects a value typed alongside N/A, bad numbers, and all-blank snapshots', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    const run = (entries: SnapshotEntryInput[]) => recordSnapshot(db, distributionId, snap('2026-10-02T10:00', entries), ctx);

    try {
      run([entry(VIEWS, '5', 'not_available')]);
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).fieldErrors[valueFieldName(VIEWS)]).toMatch(/Kosongkan/);
    }
    try {
      run([entry(VIEWS, '1.234'), entry(CTR, '150')]);
      expect.unreachable();
    } catch (e) {
      const fe = (e as DomainError).fieldErrors;
      expect(fe[valueFieldName(VIEWS)]).toBeTruthy();
      expect(fe[valueFieldName(CTR)]).toMatch(/0 dan 100/);
    }
    expect(() => run([entry(VIEWS, ''), entry(LIKES, '  ')])).toThrow(/minimal satu metrik/);
    expect((db.prepare('SELECT COUNT(*) AS n FROM metric_snapshots').get() as { n: number }).n).toBe(0);
  });

  it('persists post age at capture time (24h) and stores ratios as fractions', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db); // published 2026-10-01 10:00 Jakarta
    save(db, distributionId, snap('2026-10-02T10:00', [entry(CTR, '12,5')]));
    const row = db.prepare('SELECT post_age_seconds AS age, captured_at AS at FROM metric_snapshots').get() as { age: number; at: string };
    expect(row.age).toBe(86400);
    expect(row.at).toBe('2026-10-02T03:00:00.000Z');
    expect((db.prepare('SELECT numeric_value AS n FROM metric_values').get() as { n: number }).n).toBe(0.125);
  });

  it('rejects capture times before publication, in the future, or invalid', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    const fail = (local: string) => {
      try {
        recordSnapshot(db, distributionId, snap(local, [entry(VIEWS, '1')]), ctx);
        expect.unreachable();
      } catch (e) {
        return (e as DomainError).fieldErrors.capturedAtLocal;
      }
    };
    expect(fail('2026-09-30T10:00')).toMatch(/lebih awal dari waktu terbit/);
    expect(fail('2026-12-01T10:00')).toMatch(/masa depan/);
    expect(fail('')).toMatch(/wajib/);
    expect(fail('garbage')).toMatch(/tidak valid/);
  });

  it('with unknown published_at: needs confirmation, then stores post_age NULL (not 0)', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db, { publishedAtLocal: null, status: 'unknown' });
    const input = snap('2026-10-02T10:00', [entry(VIEWS, '5')]);
    const first = recordSnapshot(db, distributionId, input, ctx);
    expect(first).toMatchObject({ status: 'needs_confirmation' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM metric_snapshots').get() as { n: number }).n).toBe(0);

    save(db, distributionId, input, true);
    const row = db.prepare('SELECT post_age_seconds AS age FROM metric_snapshots').get() as { age: number | null };
    expect(row.age).toBeNull();
  });

  it('warns when a counter drops below the previous or exceeds the next snapshot', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '1000')]));
    save(db, distributionId, snap('2026-10-04T10:00', [entry(VIEWS, '3000')]));

    const lower = recordSnapshot(db, distributionId, snap('2026-10-05T10:00', [entry(VIEWS, '900')]), ctx);
    expect(lower).toMatchObject({ status: 'needs_confirmation' });
    if (lower.status === 'needs_confirmation') expect(lower.warnings[0]).toMatch(/Views.*lebih rendah/);

    const higher = recordSnapshot(db, distributionId, snap('2026-10-03T10:00', [entry(VIEWS, '4000')]), ctx);
    expect(higher).toMatchObject({ status: 'needs_confirmation' });
    if (higher.status === 'needs_confirmation') expect(higher.warnings[0]).toMatch(/lebih tinggi/);

    expect(recordSnapshot(db, distributionId, snap('2026-10-03T10:00', [entry(VIEWS, '2000')]), ctx).status).toBe('saved');
  });

  it('warns on a duplicate capture time', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '1')]));
    const r = recordSnapshot(db, distributionId, snap('2026-10-02T10:00', [entry(LIKES, '2')]), ctx);
    expect(r.status).toBe('needs_confirmation');
  });

  it('only accepts metrics applicable to the platform and active', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db, { platformId: 'youtube' });
    const parsed = parseInput(metricDefinitionCreateSchema, {
      key: 'tiktok_finish_rate',
      label: 'TikTok finish rate',
      unit: 'ratio',
      aggregationKind: 'ratio',
      platformId: 'tiktok',
    });
    expect(parsed.ok).toBe(true);
    const tiktokOnly = createMetricDefinition(db, (parsed as { ok: true; data: Parameters<typeof createMetricDefinition>[1] }).data);
    expect(() =>
      recordSnapshot(db, distributionId, snap('2026-10-02T10:00', [entry(tiktokOnly, '10')]), ctx),
    ).toThrow(/tidak berlaku untuk platform/);
    expect(() =>
      recordSnapshot(db, distributionId, snap('2026-10-02T10:00', [entry('nonexistent', '10')]), ctx),
    ).toThrow(DomainError);
  });

  it('correcting a snapshot creates a replacement; the original is preserved and flagged', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    const original = save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '1000')]));
    // 1,500 vs the original 1,000 would not warn either way; use a lower correction to prove the
    // superseded snapshot is excluded from neighbor warnings.
    const corrected = save(db, distributionId, snap('2026-10-02T10:05', [entry(VIEWS, '900')], { supersedesSnapshotId: original }));

    const timeline = getDistributionTimeline(db, distributionId);
    expect(timeline.snapshots).toHaveLength(2);
    expect(timeline.snapshots.find((s) => s.snapshot.id === original)!.supersededBy).toBe(corrected);
    expect(timeline.snapshots.find((s) => s.snapshot.id === original)!.values.get(VIEWS)!.numericValue).toBe(1000);

    expect(() =>
      recordSnapshot(db, distributionId, snap('2026-10-02T10:10', [entry(VIEWS, '950')], { supersedesSnapshotId: original }), ctx),
    ).toThrow(/sudah pernah dikoreksi/);
  });

  it('refuses to correct a snapshot of another distribution', () => {
    const db = testDb();
    const a = seedDistribution(db);
    const b = seedDistribution(db);
    const sa = save(db, a.distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '1')]));
    expect(() =>
      recordSnapshot(db, b.distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '2')], { supersedesSnapshotId: sa }), ctx),
    ).toThrow(DomainError);
  });

  it('builds a timeline with gaps and flags metrics lacking a source definition', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '10')]));
    save(db, distributionId, snap('2026-10-04T13:00', [entry(VIEWS, '20')]));
    const t = getDistributionTimeline(db, distributionId);
    expect(t.snapshots[0]!.gapFromPrevious).toBeNull();
    expect(t.snapshots[1]!.gapFromPrevious).toBe('2 hari 3 jam');
    expect(t.metricsMissingSource.length).toBeGreaterThan(0);
  });
});

describe('append-only guarantees', () => {
  it('blocks UPDATE on snapshots and values at the database level', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    const id = save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '10')]));
    expect(() => db.prepare('UPDATE metric_snapshots SET note = ? WHERE id = ?').run('x', id)).toThrow(/append-only/);
    expect(() => db.prepare('UPDATE metric_values SET numeric_value = 99 WHERE snapshot_id = ?').run(id)).toThrow(/append-only/);
  });

  it('rejects impossible value rows (unknown must not carry a number; known needs exactly one)', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    const id = save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '10')]));
    const insert = (n: number | null, t: string | null, state: string) =>
      db
        .prepare('INSERT INTO metric_values (snapshot_id, metric_definition_id, numeric_value, text_value, value_state) VALUES (?,?,?,?,?)')
        .run(id, LIKES, n, t, state);
    expect(() => insert(0, null, 'unknown')).toThrow(/CHECK/);
    expect(() => insert(null, null, 'known')).toThrow(/CHECK/);
    expect(() => insert(1, 'x', 'known')).toThrow(/CHECK/);
    expect(() => insert(null, null, 'unknown')).not.toThrow();
  });

  it('deleting a distribution removes its snapshots (explicit, confirmed action only)', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db);
    const first = save(db, distributionId, snap('2026-10-02T10:00', [entry(VIEWS, '10')]));
    save(db, distributionId, snap('2026-10-03T10:00', [entry(VIEWS, '20')], { supersedesSnapshotId: first }));
    expect(() => deleteDistribution(db, distributionId)).not.toThrow();
    expect((db.prepare('SELECT COUNT(*) AS n FROM metric_snapshots').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM metric_values').get() as { n: number }).n).toBe(0);
  });
});

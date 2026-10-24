import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createMetricDefinition } from './metric-definitions';
import { updateAppSettings } from './settings';
import {
  DEFAULT_QUERY,
  dateRangeToUtc,
  getAnalytics,
  getEpisodePerformance,
  getPlatformKpis,
  rowValue,
  type AnalyticsQuery,
} from './analytics';
import { addDist, snap, testDb, TZ } from '@/test/helpers';

const VIEWS = 'mdef_views';
const LIKES = 'mdef_likes';

const q = (o: Partial<AnalyticsQuery> = {}): AnalyticsQuery => ({ ...DEFAULT_QUERY, metricId: VIEWS, windowHours: 24, ...o });

describe('analytics: equivalent-age comparison', () => {
  it('keeps a measured zero distinct from an unrecorded metric', () => {
    const db = testDb();
    const a = addDist(db, 'A zero', 'youtube', '2026-10-01T10:00');
    const b = addDist(db, 'B unrecorded', 'youtube', '2026-10-02T10:00');
    snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '0' });
    snap(db, b.distributionId, '2026-10-03T10:00', { [LIKES]: '4' }); // reading exists, but views not recorded

    const report = getAnalytics(db, q());
    const rowA = report.rows.find((r) => r.episodeTitle === 'A zero')!;
    const rowB = report.rows.find((r) => r.episodeTitle === 'B unrecorded')!;
    expect(rowA.result).toMatchObject({ ok: true, value: 0, actualAgeHours: 24 });
    expect(rowB.result).toMatchObject({ ok: false, reason: 'value_unknown' });
    expect(rowValue(rowB)).toBeNull();
    const yt = report.groups.find((g) => g.platformId === 'youtube')!;
    expect(yt.summary).toEqual({ n: 1, median: 0, min: 0, max: 0 }); // the unknown is not counted as a 0 sample
    expect(report.quality).toMatchObject({ total: 2, comparable: 1, byReason: { value_unknown: 1 } });
  });

  it('uses the replacement of a corrected snapshot and ignores the superseded one', () => {
    const db = testDb();
    const a = addDist(db, 'A', 'facebook', '2026-10-01T10:00');
    const original = snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '100' });
    snap(db, a.distributionId, '2026-10-02T10:05', { [VIEWS]: '150' }, original);
    const row = getAnalytics(db, q()).rows[0]!;
    expect(row.result).toMatchObject({ ok: true, value: 150, candidateCount: 1 });
    expect(row.snapshotSource).toBe('manual');
  });

  it('does not substitute a snapshot outside the tolerance window and says how far it is', () => {
    const db = testDb();
    const a = addDist(db, 'A', 'tiktok', '2026-10-01T10:00');
    snap(db, a.distributionId, '2026-10-05T10:00', { [VIEWS]: '999' }); // 96h
    const row = getAnalytics(db, q()).rows[0]!;
    expect(row.result).toEqual({ ok: false, reason: 'no_snapshot_in_window', nearestAgeHours: 96 });
  });

  it('honours the selected window (7d ± 24h)', () => {
    const db = testDb();
    const a = addDist(db, 'A', 'youtube', '2026-10-01T10:00');
    snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '10' });
    snap(db, a.distributionId, '2026-10-08T14:00', { [VIEWS]: '70' }); // 172h
    expect(getAnalytics(db, q({ windowHours: 24 })).rows[0]!.result).toMatchObject({ ok: true, value: 10 });
    expect(getAnalytics(db, q({ windowHours: 168 })).rows[0]!.result).toMatchObject({ ok: true, value: 70, actualAgeHours: 172 });
  });

  it('respects windows configured in settings', () => {
    const db = testDb();
    updateAppSettings(db, { timezone: TZ, comparisonWindows: [{ hours: 48, toleranceHours: 2 }] });
    const a = addDist(db, 'A', 'youtube', '2026-10-01T10:00');
    snap(db, a.distributionId, '2026-10-03T10:00', { [VIEWS]: '5' });
    const report = getAnalytics(db, q({ windowHours: 999 })); // unknown window falls back to the first configured
    expect(report.window).toEqual({ hours: 48, toleranceHours: 2 });
    expect(report.rows[0]!.result).toMatchObject({ ok: true, value: 5 });
  });

  it('flags distributions with unknown publish time instead of guessing an age', () => {
    const db = testDb();
    const a = addDist(db, 'Undated', 'youtube', null);
    snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '5' });
    const report = getAnalytics(db, q());
    expect(report.rows[0]!.result).toMatchObject({ ok: false, reason: 'no_post_age' });
    expect(report.groups[0]!.undated).toBe(1); // counted, not plotted
  });
});

describe('analytics: platform separation and metric scope', () => {
  it('summarizes per platform and never combines platforms', () => {
    const db = testDb();
    const y = addDist(db, 'Y', 'youtube', '2026-10-01T10:00');
    const t = addDist(db, 'T', 'tiktok', '2026-10-01T10:00');
    snap(db, y.distributionId, '2026-10-02T10:00', { [VIEWS]: '100' });
    snap(db, t.distributionId, '2026-10-02T10:00', { [VIEWS]: '9000' });
    const report = getAnalytics(db, q());
    expect(report.groups.map((g) => [g.platformId, g.summary.median])).toEqual([
      ['youtube', 100],
      ['tiktok', 9000],
    ]);
    // No field anywhere holds a cross-platform aggregate.
    expect(JSON.stringify(report.groups)).not.toContain('9100');
  });

  it('limits a platform-specific metric to its platform and says so', () => {
    const db = testDb();
    const id = createMetricDefinition(db, {
      key: 'finish_rate',
      label: 'Finish rate',
      unit: 'ratio',
      description: null,
      aggregationKind: 'ratio',
      currencyCode: null,
      platformId: 'tiktok',
      allowNegative: false,
      sourceDefinition: null,
      formulaVersion: null,
    });
    const y = addDist(db, 'Y', 'youtube', '2026-10-01T10:00');
    const t = addDist(db, 'T', 'tiktok', '2026-10-01T10:00');
    snap(db, y.distributionId, '2026-10-02T10:00', { [VIEWS]: '1' });
    snap(db, t.distributionId, '2026-10-02T10:00', { [id]: '40' });

    const own = getAnalytics(db, q({ metricId: id }));
    expect(own.rows.map((r) => r.platformId)).toEqual(['tiktok']);
    expect(own.rows[0]!.result).toMatchObject({ ok: true, value: 0.4 });

    const wrong = getAnalytics(db, q({ metricId: id, platformId: 'youtube' }));
    expect(wrong.rows).toEqual([]);
    expect(wrong.notes.join(' ')).toMatch(/khusus TikTok/);
  });

  it('offers only active numeric metrics for analysis', () => {
    const db = testDb();
    const report = getAnalytics(db, q());
    expect(report.metricChoices.length).toBeGreaterThan(5);
    expect(report.metricChoices.every((m) => m.aggregationKind !== 'categorical' && m.isActive)).toBe(true);
  });
});

describe('analytics: filters', () => {
  function seed(db: DatabaseSync) {
    const a = addDist(db, 'Early', 'youtube', '2026-10-01T10:00', { tags: ['horor'] });
    const b = addDist(db, 'Late', 'youtube', '2026-10-10T10:00', { tags: ['lucu'] });
    const c = addDist(db, 'Undated', 'youtube', null);
    snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '10' });
    snap(db, b.distributionId, '2026-10-11T10:00', { [VIEWS]: '20' });
    return { a, b, c };
  }

  it('filters by published date range in the selected time zone (end date inclusive) and reports undated exclusions', () => {
    const db = testDb();
    seed(db);
    const late = getAnalytics(db, q({ from: '2026-10-05', to: '2026-10-10' }));
    expect(late.rows.map((r) => r.episodeTitle)).toEqual(['Late']);
    expect(late.notes.join(' ')).toMatch(/1 distribusi tanpa waktu terbit tidak ikut/);
    expect(late.quality.undatedExcludedByDateFilter).toBe(1);

    const endInclusive = getAnalytics(db, q({ from: '2026-10-01', to: '2026-10-01' }));
    expect(endInclusive.rows.map((r) => r.episodeTitle)).toEqual(['Early']);
    expect(getAnalytics(db, q({ from: '2026-10-11', to: '2026-10-12' })).rows).toEqual([]);
  });

  it('treats the day boundary in the user time zone (Jakarta 00:00 = 17:00Z the day before)', () => {
    expect(dateRangeToUtc('2026-10-05', '2026-10-05', 'Asia/Jakarta')).toMatchObject({
      publishedFrom: '2026-10-04T17:00:00.000Z',
      publishedBefore: '2026-10-05T17:00:00.000Z',
    });
  });

  it('reports a reversed range instead of silently returning data', () => {
    const range = dateRangeToUtc('2026-10-10', '2026-10-01', TZ);
    expect(range.notes.join(' ')).toMatch(/terbalik/);
  });

  it('filters by tag, episode and platform', () => {
    const db = testDb();
    const { a } = seed(db);
    expect(getAnalytics(db, q({ tag: 'horor' })).rows.map((r) => r.episodeTitle)).toEqual(['Early']);
    expect(getAnalytics(db, q({ episodeId: a.episodeId })).rows).toHaveLength(1);
    expect(getAnalytics(db, q({ platformId: 'facebook' })).rows).toEqual([]);
  });

  it('ignores filter values that are bound as data (no SQL injection through tag)', () => {
    const db = testDb();
    seed(db);
    expect(getAnalytics(db, q({ tag: "x' OR '1'='1" })).rows).toEqual([]);
  });
});

describe('analytics: sorting and ranking', () => {
  function seedMany(db: DatabaseSync, values: (string | null)[]) {
    values.forEach((v, i) => {
      const d = addDist(db, `Post ${i + 1}`, 'youtube', `2026-10-0${i + 1}T10:00`);
      const day = `2026-10-0${i + 2}`;
      snap(db, d.distributionId, `${day}T10:00`, v === null ? { [LIKES]: '1' } : { [VIEWS]: v });
    });
  }

  it('sorts by value with unknown rows always last (both directions)', () => {
    const db = testDb();
    seedMany(db, ['30', null, '10', '20']);
    const titles = (dir: 'asc' | 'desc') => getAnalytics(db, q({ sort: 'value', dir })).rows.map((r) => r.episodeTitle);
    expect(titles('desc')).toEqual(['Post 1', 'Post 4', 'Post 3', 'Post 2']);
    expect(titles('asc')).toEqual(['Post 3', 'Post 4', 'Post 1', 'Post 2']);
  });

  it('withholds rankings below the minimum sample and warns on small samples', () => {
    const db = testDb();
    seedMany(db, ['30', '10']);
    let g = getAnalytics(db, q()).groups[0]!;
    expect(g.top).toEqual([]);
    expect(g.rankingNote).toMatch(/n=2 < 3/);

    const db2 = testDb();
    seedMany(db2, ['30', '10', '20']);
    g = getAnalytics(db2, q()).groups[0]!;
    expect(g.top.map((r) => rowValue(r))).toEqual([30, 20, 10]);
    expect(g.bottom).toEqual([]);
    expect(g.rankingNote).toMatch(/Sampel kecil/);

    const db3 = testDb();
    seedMany(db3, ['6', '5', '4', '3', '2', '1']);
    g = getAnalytics(db3, q()).groups[0]!;
    expect(g.top.map((r) => rowValue(r))).toEqual([6, 5, 4]);
    expect(g.bottom.map((r) => rowValue(r))).toEqual([1, 2, 3]);
  });

  it('builds a trend series in publish order with gaps (null) for non-comparable posts', () => {
    const db = testDb();
    seedMany(db, ['30', null, '10']);
    const trend = getAnalytics(db, q()).groups[0]!.trend;
    expect(trend.map((p) => p.value)).toEqual([30, null, 10]);
    expect(trend[1]!.reason).toBe('value_unknown');
  });
});

describe('analytics: KPIs and episode performance', () => {
  it('shows latest vs previous per platform, and no relative delta from a zero baseline', () => {
    const db = testDb();
    const a = addDist(db, 'Old', 'youtube', '2026-10-01T10:00');
    const b = addDist(db, 'New', 'youtube', '2026-10-05T10:00');
    snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '0' });
    snap(db, b.distributionId, '2026-10-06T10:00', { [VIEWS]: '50' });
    const { kpis } = getPlatformKpis(db);
    expect(kpis).toHaveLength(1);
    expect(kpis[0]).toMatchObject({ platformId: 'youtube', latestLabel: 'New', previousLabel: 'Old' });
    expect(kpis[0]!.change).toEqual({ absolute: 50, relative: null, reason: 'baseline_zero' });
  });

  it('reports why the latest post has no value rather than showing 0', () => {
    const db = testDb();
    addDist(db, 'No data yet', 'tiktok', '2026-10-05T10:00');
    const { kpis } = getPlatformKpis(db);
    expect(kpis[0]!.latest).toMatchObject({ ok: false, reason: 'no_snapshots' });
    expect(kpis[0]!.change).toBeNull();
  });

  it('lists window values and snapshot-to-snapshot changes with explicit unavailability', () => {
    const db = testDb();
    const a = addDist(db, 'Ep', 'youtube', '2026-10-01T10:00');
    snap(db, a.distributionId, '2026-10-02T10:00', { [VIEWS]: '100' });
    snap(db, a.distributionId, '2026-10-03T10:00', { [LIKES]: '3' }); // views unknown here
    snap(db, a.distributionId, '2026-10-08T10:00', { [VIEWS]: '400' });
    const perf = getEpisodePerformance(db, a.episodeId, VIEWS);
    const d = perf.distributions[0]!;
    expect(d.series.map((s) => s.value)).toEqual([100, null, 400]);
    expect(d.windows.map((w) => [w.window.hours, w.result.ok ? w.result.value : null])).toEqual([
      [24, 100],
      [168, 400],
    ]);
    expect(d.changes.map((c) => c.change.reason)).toEqual(['unknown_value', 'unknown_value']);

    snap(db, a.distributionId, '2026-10-09T10:00', { [VIEWS]: '500' });
    const again = getEpisodePerformance(db, a.episodeId, VIEWS).distributions[0]!;
    expect(again.changes.at(-1)!.change).toEqual({ absolute: 100, relative: 0.25, reason: null });
  });
});

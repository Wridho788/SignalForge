import { describe, expect, it } from 'vitest';
import { ageAxis, ageTickLabel, distributionSeries, evenTicks, platformTrend } from './chart-data';
import { parseAnalyticsParams, queryToSearch } from './params';

const metric = { aggregationKind: 'counter' as const, currencyCode: null, unit: 'views' };

describe('parseAnalyticsParams', () => {
  it('accepts valid values', () => {
    const { query, ignored } = parseAnalyticsParams({
      metric: 'mdef_views',
      window: '168',
      platform: 'tiktok',
      tag: 'horor',
      from: '2026-10-01',
      to: '2026-10-31',
      sort: 'value',
      dir: 'asc',
    });
    expect(ignored).toEqual([]);
    expect(query).toMatchObject({ metricId: 'mdef_views', windowHours: 168, platformId: 'tiktok', tag: 'horor', from: '2026-10-01', to: '2026-10-31', sort: 'value', dir: 'asc' });
  });

  it('drops untrusted or malformed values and reports them', () => {
    const { query, ignored } = parseAnalyticsParams({
      metric: "x'; DROP TABLE episodes;--",
      window: '-5',
      platform: 'instagram',
      from: '2026-02-30',
      to: 'tomorrow',
      sort: 'password',
      dir: 'sideways',
    });
    expect(query).toMatchObject({ metricId: null, windowHours: null, platformId: null, from: null, to: null, sort: 'published', dir: 'desc' });
    expect(ignored).toEqual(expect.arrayContaining(['metrik', 'usia target', 'platform', 'tanggal mulai', 'tanggal akhir', 'urutan', 'arah urutan']));
  });

  it('takes the first of repeated parameters and ignores blanks', () => {
    expect(parseAnalyticsParams({ platform: ['youtube', 'tiktok'], tag: '  ' }).query).toMatchObject({ platformId: 'youtube', tag: null });
  });
});

describe('queryToSearch', () => {
  it('round-trips and omits defaults', () => {
    const { query } = parseAnalyticsParams({ platform: 'youtube', sort: 'value', dir: 'asc' });
    expect(queryToSearch(query)).toBe('?platform=youtube&sort=value&dir=asc');
    expect(queryToSearch(query, { sort: 'published', dir: 'desc' })).toBe('?platform=youtube');
    expect(queryToSearch(parseAnalyticsParams({}).query)).toBe('');
  });
});

describe('chart data', () => {
  it('labels ages compactly', () => {
    expect(ageTickLabel(24)).toBe('24 j');
    expect(ageTickLabel(48)).toBe('48 j');
    expect(ageTickLabel(168)).toBe('7 hr');
  });

  it('uses a single unit per age axis, with round ticks', () => {
    expect(ageAxis(48)).toMatchObject({ label: 'Usia post (jam)', ticks: [{ x: 0, label: '0 j' }, { x: 20, label: '20 j' }, { x: 40, label: '40 j' }, { x: 60, label: '60 j' }] });
    const days = ageAxis(200); // 8.3 days
    expect(days.label).toBe('Usia post (hari)');
    expect(days.ticks.map((t) => t.label)).toEqual(['0 hr', '3 hr', '6 hr', '9 hr']);
    expect(days.ticks[1]!.x).toBe(72); // positions stay in hours
    expect(ageAxis(24 * 40).ticks.map((t) => t.label)).toEqual(['0 hr', '10 hr', '20 hr', '30 hr', '40 hr']);
  });

  it('spreads ticks and handles a zero span', () => {
    expect(evenTicks(0, 30, 4)).toEqual([0, 10, 20, 30]);
    expect(evenTicks(5, 5)).toEqual([5]);
  });

  it('turns non-comparable posts into gaps, keeping the reason in text', () => {
    const { points } = platformTrend(
      [
        { distributionId: 'a', label: 'A', publishedAt: '2026-10-01T03:00:00.000Z', value: 0, reason: null, actualAgeHours: 24 },
        { distributionId: 'b', label: 'B', publishedAt: '2026-10-02T03:00:00.000Z', value: null, reason: 'value_unknown', actualAgeHours: null },
      ],
      metric,
      { hours: 24, toleranceHours: 6 },
      'Asia/Jakarta',
    );
    expect(points[0]).toMatchObject({ y: 0, yText: '0, usia aktual 24 jam' }); // measured zero is plotted
    expect(points[1]).toMatchObject({ y: null });
    expect(points[1]!.yText).toContain('Nilai metrik tidak diketahui');
  });

  it('places series by post age and counts snapshots that have no age', () => {
    const r = distributionSeries(
      [
        { snapshotId: '1', capturedAt: '2026-10-02T03:00:00.000Z', postAgeHours: 24, value: 10, state: 'known' },
        { snapshotId: '2', capturedAt: '2026-10-03T03:00:00.000Z', postAgeHours: 48, value: null, state: 'not_available' },
        { snapshotId: '3', capturedAt: '2026-10-04T03:00:00.000Z', postAgeHours: null, value: 5, state: 'known' },
      ],
      metric,
      [{ hours: 24, toleranceHours: 6 }],
      'Asia/Jakarta',
    );
    expect(r.points.map((p) => p.y)).toEqual([10, null]);
    expect(r.points[1]!.yText).toContain('tidak tersedia di platform');
    expect(r.unplaced).toBe(1);
    expect(r.bands).toEqual([{ from: 18, to: 30, label: '24 j' }]);
  });
});

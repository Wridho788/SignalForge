import { describe, expect, it } from 'vitest';
import { selectEquivalent, type SnapshotPoint } from './equivalent-age';
import { compareNullable, computeChange, summarize } from './stats';

const H = 3600;
const pt = (id: string, ageHours: number | null, value: number | null, state: SnapshotPoint['state'] = value === null ? null : 'known'): SnapshotPoint => ({
  snapshotId: id,
  capturedAt: `2026-10-${String(1 + Math.floor((ageHours ?? 0) / 24)).padStart(2, '0')}T${String(Math.floor((ageHours ?? 0) % 24)).padStart(2, '0')}:00:00.000Z`,
  postAgeSeconds: ageHours === null ? null : ageHours * H,
  state,
  numericValue: value,
});

describe('selectEquivalent (24h ± 6h)', () => {
  const sel = (points: SnapshotPoint[]) => selectEquivalent(points, 24, 6);

  it('picks the known reading closest to the target and reports its actual age', () => {
    const r = sel([pt('a', 20, 100), pt('b', 25, 130), pt('c', 29, 150)]);
    expect(r).toMatchObject({ ok: true, snapshotId: 'b', value: 130, actualAgeHours: 25, deltaHours: 1, candidateCount: 3 });
  });

  it('includes the tolerance boundary and excludes just beyond it', () => {
    expect(sel([pt('edge', 30, 5)])).toMatchObject({ ok: true, snapshotId: 'edge' });
    expect(sel([pt('edge', 18, 5)])).toMatchObject({ ok: true, snapshotId: 'edge' });
    expect(sel([pt('out', 30.01, 5)])).toMatchObject({ ok: false, reason: 'no_snapshot_in_window' });
  });

  it('breaks ties toward the earlier capture, deterministically', () => {
    const early = pt('early', 22, 10);
    const late = pt('late', 26, 20);
    expect(sel([late, early])).toMatchObject({ snapshotId: 'early' });
    expect(sel([early, late])).toMatchObject({ snapshotId: 'early' });
  });

  it('never substitutes a far snapshot: reports the nearest age instead', () => {
    const r = sel([pt('far', 72, 999)]);
    expect(r).toEqual({ ok: false, reason: 'no_snapshot_in_window', nearestAgeHours: 72 });
  });

  it('keeps a measured zero (value 0 is a valid reading, not "missing")', () => {
    expect(sel([pt('z', 24, 0)])).toMatchObject({ ok: true, value: 0 });
  });

  it('explains every kind of absence', () => {
    expect(sel([])).toMatchObject({ ok: false, reason: 'no_snapshots' });
    expect(sel([pt('x', null, 5)])).toMatchObject({ ok: false, reason: 'no_post_age' });
    expect(sel([pt('u', 24, null)])).toMatchObject({ ok: false, reason: 'value_unknown' });
    expect(sel([pt('n', 24, null, 'not_available')])).toMatchObject({ ok: false, reason: 'not_available' });
    expect(sel([pt('p', 24, null, 'not_applicable')])).toMatchObject({ ok: false, reason: 'not_applicable' });
  });

  it('ignores unknown readings when a known one exists in the window', () => {
    expect(sel([pt('u', 24, null), pt('k', 27, 40)])).toMatchObject({ ok: true, snapshotId: 'k', candidateCount: 1 });
  });

  it('ignores snapshots without post age when others have it', () => {
    expect(sel([pt('noage', null, 999), pt('ok', 24, 7)])).toMatchObject({ ok: true, snapshotId: 'ok' });
  });

  it('supports custom windows such as 7d ± 24h', () => {
    expect(selectEquivalent([pt('w', 160, 1)], 168, 24)).toMatchObject({ ok: true });
    expect(selectEquivalent([pt('w', 100, 1)], 168, 24)).toMatchObject({ ok: false });
  });
});

describe('computeChange', () => {
  it('computes absolute and relative change with a valid baseline', () => {
    expect(computeChange(100, 150)).toEqual({ absolute: 50, relative: 0.5, reason: null });
    expect(computeChange(200, 100)).toEqual({ absolute: -100, relative: -0.5, reason: null });
  });

  it('makes relative change unavailable for a zero baseline (but keeps absolute)', () => {
    expect(computeChange(0, 40)).toEqual({ absolute: 40, relative: null, reason: 'baseline_zero' });
    expect(computeChange(0, 0)).toEqual({ absolute: 0, relative: null, reason: 'baseline_zero' });
  });

  it('is unavailable when either side is unknown — unknown is not 0', () => {
    expect(computeChange(null, 10)).toEqual({ absolute: null, relative: null, reason: 'unknown_value' });
    expect(computeChange(10, null)).toEqual({ absolute: null, relative: null, reason: 'unknown_value' });
  });

  it('does not compute a relative change from a negative baseline', () => {
    expect(computeChange(-10, 5)).toMatchObject({ absolute: 15, relative: null, reason: 'baseline_negative' });
  });
});

describe('summarize', () => {
  it('handles empty, odd and even samples', () => {
    expect(summarize([])).toEqual({ n: 0, median: null, min: null, max: null });
    expect(summarize([5, 1, 3])).toEqual({ n: 3, median: 3, min: 1, max: 5 });
    expect(summarize([4, 1, 2, 10])).toEqual({ n: 4, median: 3, min: 1, max: 10 });
  });

  it('counts a measured zero as a sample', () => {
    expect(summarize([0, 0, 6])).toMatchObject({ n: 3, median: 0 });
  });
});

describe('compareNullable', () => {
  it('sorts nulls last in both directions', () => {
    const vals = [3, null, 1, 2, null];
    expect([...vals].sort((a, b) => compareNullable(a, b, 'asc'))).toEqual([1, 2, 3, null, null]);
    expect([...vals].sort((a, b) => compareNullable(a, b, 'desc'))).toEqual([3, 2, 1, null, null]);
  });

  it('sorts strings', () => {
    expect(['b', 'a', null].sort((a, b) => compareNullable(a, b, 'asc'))).toEqual(['a', 'b', null]);
  });
});

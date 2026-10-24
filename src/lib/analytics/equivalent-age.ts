import type { ValueState } from '../domain/types';

/** One (non-superseded) snapshot's reading of a single metric. `state` is null when no value row exists (unknown). */
export interface SnapshotPoint {
  snapshotId: string;
  capturedAt: string;
  postAgeSeconds: number | null;
  state: ValueState | null;
  numericValue: number | null;
}

export type UnavailableReason =
  | 'no_snapshots' // distribution has no usable snapshots
  | 'no_post_age' // snapshots exist but none has a post age (published_at unknown at capture)
  | 'no_snapshot_in_window' // aged snapshots exist, none within target ± tolerance
  | 'value_unknown' // a snapshot is in the window but the metric was not recorded
  | 'not_available' // in the window, marked unavailable on the platform
  | 'not_applicable'; // in the window, marked not applicable

export type EquivalentResult =
  | {
      ok: true;
      value: number;
      snapshotId: string;
      capturedAt: string;
      actualAgeHours: number;
      /** actual − target, in hours (signed). */
      deltaHours: number;
      /** How many known readings fell inside the window (the rule below picked one). */
      candidateCount: number;
    }
  | { ok: false; reason: UnavailableReason; nearestAgeHours: number | null };

export const REASON_LABELS: Record<UnavailableReason, string> = {
  no_snapshots: 'Belum ada snapshot',
  no_post_age: 'Usia post tidak diketahui',
  no_snapshot_in_window: 'Tidak ada snapshot di jendela usia',
  value_unknown: 'Nilai metrik tidak diketahui',
  not_available: 'Tidak tersedia di platform',
  not_applicable: 'Tidak berlaku',
};

const EPS = 1e-9;

/**
 * Picks the reading to use for "value at target age".
 * Rule (documented in DATA_MODEL §3): among KNOWN readings whose post age is within
 * target ± tolerance, take the one closest to the target; ties go to the earlier capture.
 * Anything else yields an explicit reason — a missing reading is never turned into 0 and a
 * far-away snapshot is never silently substituted.
 */
export function selectEquivalent(points: SnapshotPoint[], targetHours: number, toleranceHours: number): EquivalentResult {
  if (points.length === 0) return { ok: false, reason: 'no_snapshots', nearestAgeHours: null };

  const aged = points
    .filter((p) => p.postAgeSeconds !== null && p.postAgeSeconds >= 0)
    .map((p) => ({ p, ageH: p.postAgeSeconds! / 3600 }));
  if (aged.length === 0) return { ok: false, reason: 'no_post_age', nearestAgeHours: null };

  const inWindow = aged.filter((a) => Math.abs(a.ageH - targetHours) <= toleranceHours + EPS);
  if (inWindow.length === 0) {
    const nearest = aged.reduce((best, a) => (Math.abs(a.ageH - targetHours) < Math.abs(best.ageH - targetHours) ? a : best));
    return { ok: false, reason: 'no_snapshot_in_window', nearestAgeHours: nearest.ageH };
  }

  const known = inWindow.filter((a) => a.p.state === 'known' && a.p.numericValue !== null);
  if (known.length === 0) {
    const states = new Set(inWindow.map((a) => a.p.state));
    const reason: UnavailableReason = states.has('not_available')
      ? 'not_available'
      : states.has('not_applicable')
        ? 'not_applicable'
        : 'value_unknown';
    return { ok: false, reason, nearestAgeHours: null };
  }

  const best = known.reduce((b, a) => {
    const da = Math.abs(a.ageH - targetHours);
    const db = Math.abs(b.ageH - targetHours);
    if (da < db - EPS) return a;
    if (Math.abs(da - db) <= EPS && a.p.capturedAt < b.p.capturedAt) return a;
    return b;
  });
  return {
    ok: true,
    value: best.p.numericValue!,
    snapshotId: best.p.snapshotId,
    capturedAt: best.p.capturedAt,
    actualAgeHours: best.ageH,
    deltaHours: best.ageH - targetHours,
    candidateCount: known.length,
  };
}

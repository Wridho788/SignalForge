export type ChangeUnavailable = 'unknown_value' | 'baseline_zero' | 'baseline_negative';

export interface Change {
  /** current − baseline; null if either side is unknown. */
  absolute: number | null;
  /** (current − baseline) / baseline as a fraction; null when not defined (see `reason`). */
  relative: number | null;
  /** Why `relative` (or `absolute`) is unavailable. */
  reason: ChangeUnavailable | null;
}

export const CHANGE_REASON_LABELS: Record<ChangeUnavailable, string> = {
  unknown_value: 'Salah satu nilai tidak diketahui',
  baseline_zero: 'Baseline 0, perubahan relatif tidak terdefinisi',
  baseline_negative: 'Baseline negatif, perubahan relatif ambigu',
};

/**
 * Growth between two readings (DATA_MODEL §2): absolute is shown whenever both are known; relative
 * is unavailable when the baseline is unknown, zero, or negative. Never divides by zero, never
 * treats unknown as 0.
 */
export function computeChange(baseline: number | null, current: number | null): Change {
  if (baseline === null || current === null) return { absolute: null, relative: null, reason: 'unknown_value' };
  const absolute = current - baseline;
  if (baseline === 0) return { absolute, relative: null, reason: 'baseline_zero' };
  if (baseline < 0) return { absolute, relative: null, reason: 'baseline_negative' };
  return { absolute, relative: absolute / baseline, reason: null };
}

export interface Summary {
  n: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

/** Descriptive statistics for values of ONE metric on ONE platform. Never sums across platforms. */
export function summarize(values: number[]): Summary {
  if (values.length === 0) return { n: 0, median: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { n: sorted.length, median, min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

/** Ascending/descending comparator that always puts null/undefined LAST (unknown is not the smallest value). */
export function compareNullable<T extends string | number>(a: T | null | undefined, b: T | null | undefined, dir: 'asc' | 'desc'): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  const cmp = typeof a === 'string' ? a.localeCompare(b as string) : (a as number) - (b as number);
  return dir === 'asc' ? cmp : -cmp;
}

/** Below this many comparable posts a ranking is shown only with a warning; below MIN it is not shown. */
export const MIN_RANK_SAMPLE = 3;
export const SMALL_SAMPLE = 5;

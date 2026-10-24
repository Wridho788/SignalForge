import type { ChartBand, ChartPoint } from '@/components/charts/TrendChart';
import { compactNumber, niceTicks } from '@/components/charts/scale';
import { REASON_LABELS } from '@/lib/analytics/equivalent-age';
import { formatMetricValue, type DisplayMetric } from '@/lib/metrics/format';
import type { ComparisonWindow } from '@/lib/validation/settings';
import type { SeriesPoint, TrendPoint } from '@/lib/services/analytics';
import { formatDateTime, formatPostAge } from '@/lib/time';

const known = (n: number) => ({ valueState: 'known' as const, numericValue: n, textValue: null });

export function axisFormatter(metric: DisplayMetric): (v: number) => string {
  if (metric.aggregationKind === 'ratio') return (v) => `${compactNumber(v * 100)}%`;
  return (v) => compactNumber(v);
}

/** Short label for an age in hours: "24 j" (jam) under 3 days, otherwise "7 hr" (hari). */
export function ageTickLabel(hours: number): string {
  if (hours < 72) return `${Number(hours.toFixed(1))} j`;
  return `${Number((hours / 24).toFixed(1))} hr`;
}

/**
 * Age axis ticks in ONE unit per chart: hours when the data spans ≤ 3 days, otherwise whole-ish days.
 * (Mixing "50 j" and "4,2 hr" on one axis is unreadable.) Positions stay in hours.
 */
export function ageAxis(maxHours: number): { ticks: { x: number; label: string }[]; label: string } {
  if (maxHours <= 72) {
    const t = niceTicks(0, Math.max(maxHours, 1), 4).ticks;
    return { ticks: t.map((x) => ({ x, label: `${x} j` })), label: 'Usia post (jam)' };
  }
  // Whole days only: first "round" step that yields about four intervals.
  const maxDays = maxHours / 24;
  const step = [1, 2, 3, 5, 7, 10, 14, 30, 60, 90, 180, 365].find((s) => s >= maxDays / 4) ?? 365;
  const days = Array.from({ length: Math.ceil(maxDays / step) + 1 }, (_, i) => i * step);
  return { ticks: days.map((d) => ({ x: d * 24, label: `${d} hr` })), label: 'Usia post (hari)' };
}

/** Up to `max` evenly spaced values across [min, max] (inclusive); one value if the span is zero. */
export function evenTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

/** Trend of "value at the target age" across posts, in publish order (x = published time). */
export function platformTrend(
  trend: TrendPoint[],
  metric: DisplayMetric,
  window: ComparisonWindow,
  timezone: string,
): { points: ChartPoint[]; xTicks: { x: number; label: string }[] } {
  const points: ChartPoint[] = trend.map((t) => {
    const x = Date.parse(t.publishedAt);
    const published = formatDateTime(t.publishedAt, timezone);
    const valueText =
      t.value !== null
        ? formatMetricValue(metric, known(t.value)).text
        : `— (${t.reason ? REASON_LABELS[t.reason] : 'tidak diketahui'})`;
    const ageNote = t.actualAgeHours !== null ? `, usia aktual ${formatPostAge(t.actualAgeHours * 3600)}` : '';
    return {
      x,
      y: t.value,
      tip: `${t.label}\nTerbit ${published}\n${valueText}${ageNote}`,
      xLabel: `${published} — ${t.label}`,
      yText: t.value !== null ? `${valueText}${ageNote}` : valueText,
    };
  });
  const xs = points.map((p) => p.x);
  const ticks = xs.length ? evenTicks(Math.min(...xs), Math.max(...xs), Math.min(4, Math.max(1, new Set(xs).size))) : [];
  return {
    points,
    xTicks: ticks.map((x) => ({ x, label: formatDateTime(new Date(x).toISOString(), timezone).slice(5, 10) })),
  };
}

/** One distribution's readings against post age (x = hours since publish). Snapshots without an age cannot be placed. */
export function distributionSeries(
  series: SeriesPoint[],
  metric: DisplayMetric,
  windows: ComparisonWindow[],
  timezone: string,
): { points: ChartPoint[]; xTicks: { x: number; label: string }[]; xAxisLabel: string; bands: ChartBand[]; unplaced: number } {
  const placed = series.filter((s) => s.postAgeHours !== null);
  const points: ChartPoint[] = placed.map((s) => {
    const captured = formatDateTime(s.capturedAt, timezone);
    const age = formatPostAge(s.postAgeHours! * 3600);
    const valueText =
      s.value !== null
        ? formatMetricValue(metric, known(s.value)).text
        : s.state === 'not_available'
          ? 'N/A (tidak tersedia di platform)'
          : s.state === 'not_applicable'
            ? 'Tidak berlaku'
            : '— (tidak diketahui)';
    return {
      x: s.postAgeHours!,
      y: s.value,
      tip: `Usia ${age}\nDiambil ${captured}\n${valueText}`,
      xLabel: `${age} (diambil ${captured})`,
      yText: valueText,
    };
  });
  const maxAge = Math.max(0, ...placed.map((s) => s.postAgeHours!), ...windows.map((w) => w.hours + w.toleranceHours));
  const useful = windows.filter((w) => w.hours - w.toleranceHours <= maxAge);
  const axis = ageAxis(Math.max(...placed.map((s) => s.postAgeHours!), 1));
  return {
    points,
    xTicks: axis.ticks,
    xAxisLabel: axis.label,
    bands: useful.map((w) => ({ from: Math.max(0, w.hours - w.toleranceHours), to: w.hours + w.toleranceHours, label: ageTickLabel(w.hours) })),
    unplaced: series.length - placed.length,
  };
}

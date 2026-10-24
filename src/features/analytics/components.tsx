import { Badge } from '@/components/ui/feedback';
import { REASON_LABELS, type EquivalentResult } from '@/lib/analytics/equivalent-age';
import { CHANGE_REASON_LABELS, type Change } from '@/lib/analytics/stats';
import type { PlatformId } from '@/lib/domain/types';
import { formatMetricValue, type DisplayMetric } from '@/lib/metrics/format';
import { formatPostAge } from '@/lib/time';

/** Fixed per-platform hue (color follows the entity): categorical slots 1–3, validated all-pairs. */
export const PLATFORM_COLORS: Record<PlatformId, string> = {
  facebook: '#2a78d6',
  youtube: '#eb6834',
  tiktok: '#1baf7a',
};

export const known = (n: number) => ({ valueState: 'known' as const, numericValue: n, textValue: null });

export function ResultValue({ result, metric }: { result: EquivalentResult; metric: DisplayMetric }) {
  if (!result.ok) {
    return (
      <span title={REASON_LABELS[result.reason]}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{REASON_LABELS[result.reason]}</span>
      </span>
    );
  }
  return <span>{formatMetricValue(metric, known(result.value)).text}</span>;
}

export function ResultStatus({ result }: { result: EquivalentResult }) {
  if (result.ok) return <Badge tone="success">Sebanding</Badge>;
  const tone = result.reason === 'no_snapshot_in_window' || result.reason === 'no_post_age' ? 'warning' : 'neutral';
  return (
    <span className="flex flex-col gap-0.5">
      <Badge tone={tone}>{REASON_LABELS[result.reason]}</Badge>
      {result.reason === 'no_snapshot_in_window' && result.nearestAgeHours !== null ? (
        <span className="text-xs text-muted">snapshot terdekat berusia {formatPostAge(result.nearestAgeHours * 3600)}</span>
      ) : null}
    </span>
  );
}

const signed = new Intl.NumberFormat('id-ID', { signDisplay: 'exceptZero', maximumFractionDigits: 4 });
const pct = new Intl.NumberFormat('id-ID', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });

/** Absolute and relative change, with the reason when either is not defined. */
export function ChangeText({ change, metric }: { change: Change; metric: DisplayMetric }) {
  if (change.absolute === null) {
    return <span className="text-muted">Tidak tersedia — {CHANGE_REASON_LABELS[change.reason ?? 'unknown_value']}</span>;
  }
  const abs = metric.aggregationKind === 'ratio' ? `${signed.format(Number((change.absolute * 100).toFixed(4)))} poin persentase` : signed.format(change.absolute);
  return (
    <span>
      {abs}
      {change.relative !== null ? ` (${pct.format(change.relative)})` : null}
      {change.relative === null && change.reason ? (
        <span className="block text-xs text-muted">Relatif tidak tersedia: {CHANGE_REASON_LABELS[change.reason]}</span>
      ) : null}
    </span>
  );
}

export function metricBasis(m: { label: string; unit: string }, window: { hours: number; toleranceHours: number }): string {
  return `${m.label} (${m.unit}) pada usia ${window.hours} jam ± ${window.toleranceHours} jam`;
}

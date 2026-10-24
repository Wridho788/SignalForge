import Link from 'next/link';
import { REASON_LABELS } from '@/lib/analytics/equivalent-age';
import { formatMetricValue } from '@/lib/metrics/format';
import type { PlatformKpi } from '@/lib/services/analytics';
import type { MetricDefinitionRow } from '@/lib/repositories/metric-definitions';
import type { ComparisonWindow } from '@/lib/validation/settings';
import { formatDateTime, formatPostAge } from '@/lib/time';
import { ChangeText, known, metricBasis } from './components';

/**
 * KPI tiles: label · value+unit · comparison basis · period · optional delta (DESIGN_SYSTEM → KPI tile).
 * Unknown shows "—" with the reason; the delta is hidden unless a valid baseline exists.
 */
export function KpiRow({
  metric,
  window,
  kpis,
  timezone,
}: {
  metric: MetricDefinitionRow;
  window: ComparisonWindow;
  kpis: PlatformKpi[];
  timezone: string;
}) {
  if (kpis.length === 0) return null;
  return (
    <section aria-labelledby="kpi-heading" className="mb-8">
      <h2 id="kpi-heading" className="mb-1 text-lg font-semibold">
        Post terbaru per platform
      </h2>
      <p className="mb-3 text-sm text-muted">
        {metricBasis(metric, window)}. Tiap platform dibaca terpisah; tidak ada total lintas platform.{' '}
        <Link href="/analytics" className="text-primary underline">
          Buka Analitik
        </Link>
      </p>
      <ul className="grid gap-3 md:grid-cols-3">
        {kpis.map((k) => (
          <li key={k.platformId} className="card p-4">
            <p className="text-sm text-muted">
              {k.platformName} · {metric.label} ({metric.unit}) @ {window.hours} j
            </p>
            <p className="text-3xl font-bold">
              {k.latest.ok ? (
                formatMetricValue(metric, known(k.latest.value)).text
              ) : (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">{REASON_LABELS[k.latest.reason]}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-sm">
              <span className="font-semibold">{k.latestLabel}</span>
              <span className="block text-muted">
                Terbit {k.latestPublishedAt ? formatDateTime(k.latestPublishedAt, timezone) : '—'} ({timezone})
                {k.latest.ok ? ` · usia aktual ${formatPostAge(k.latest.actualAgeHours * 3600)}` : ` · ${REASON_LABELS[k.latest.reason]}`}
              </span>
            </p>
            <div className="mt-2 border-t border-line pt-2 text-sm">
              {k.change && k.previousLabel ? (
                <>
                  <span className="text-muted">Dibanding post sebelumnya ({k.previousLabel}): </span>
                  <ChangeText change={k.change} metric={metric} />
                </>
              ) : (
                <span className="text-muted">Perubahan tidak tersedia — belum ada post sebelumnya yang sebanding sebagai baseline.</span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              {k.comparable} dari {k.total} distribusi sebanding. Selisih angka bukan bukti sebab-akibat.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

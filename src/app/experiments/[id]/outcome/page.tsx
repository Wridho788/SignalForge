import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { VerdictBadge } from '@/features/experiments/components';
import { outcomeAction } from '@/features/experiments/actions';
import { OutcomeForm } from '@/features/experiments/forms';
import { getDb } from '@/lib/db/connection';
import { known } from '@/features/analytics/components';
import { formatMetricValue } from '@/lib/metrics/format';
import { orNotFound } from '@/lib/page-helpers';
import { getExperimentEvidence } from '@/lib/services/experiments';

export const metadata = { title: 'Catat hasil eksperimen' };

export default async function OutcomePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ev = orNotFound(() => getExperimentEvidence(getDb(), id));
  const { experiment: x, metric } = ev.detail;
  if (x.status !== 'running') notFound();

  const insufficient = ev.evidence.platforms.length === 0 || ev.evidence.platforms.some((p) => p.verdict === 'insufficient');
  const fmt = (n: number | null) => (n === null ? '—' : formatMetricValue(metric, known(n)).text);

  return (
    <>
      <Breadcrumbs items={[{ href: '/experiments', label: 'Eksperimen' }, { href: `/experiments/${id}`, label: x.title }, { label: 'Catat hasil' }]} />
      <PageHeader title="Catat hasil" description={`Kriteria yang ditetapkan sebelumnya: ${ev.successDescription}`} />

      <section aria-labelledby="ev-heading" className="card mb-6">
        <h2 id="ev-heading" className="mb-2 text-lg font-semibold">
          Bukti saat ini
        </h2>
        {ev.evidence.platforms.length === 0 ? (
          <p className="text-sm text-muted">Belum ada baseline/varian yang bisa dibandingkan.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {ev.evidence.platforms.map((p) => (
              <li key={p.platformId} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{ev.links.find((l) => l.platformId === p.platformId)?.platformName ?? p.platformId}:</span>
                <span>
                  baseline {fmt(p.baseline.median)} (n={p.baseline.comparable}) · varian {fmt(p.variant.median)} (n={p.variant.comparable})
                </span>
                <VerdictBadge evidence={p} />
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          {ev.evidence.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      {insufficient ? (
        <div className="mb-4">
          <Alert tone="warning" title="Data belum cukup untuk sebagian atau seluruh platform">
            Pertimbangkan keputusan <strong>Tidak konklusif</strong> daripada menyimpulkan dari data yang belum sebanding. Itu hasil yang sah dan tetap tercatat sebagai pembelajaran.
          </Alert>
        </div>
      ) : null}

      <OutcomeForm action={outcomeAction.bind(null, id)} cancelHref={`/experiments/${id}`} />
    </>
  );
}

import Link from 'next/link';
import { connection } from 'next/server';
import { EmptyState, Alert, Badge } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout-bits';
import { getDb } from '@/lib/db/connection';
import { APP_NAME, ANALYSIS_CYCLE } from '@/lib/identity';
import { DECISION_LABELS } from '@/lib/experiments/model';
import { KpiRow } from '@/features/analytics/Kpis';
import { getPlatformKpis } from '@/lib/services/analytics';
import { getOverviewStats } from '@/lib/services/overview';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime } from '@/lib/time';

export const metadata = { title: 'Ringkasan' };

// Honest status of each stage of the analysis cycle; later milestones flip these.
const CYCLE_STATUS: Record<(typeof ANALYSIS_CYCLE)[number], { available: boolean; note: string }> = {
  Measure: { available: true, note: 'Catat episode, distribusi, dan snapshot metrik manual.' },
  Understand: { available: true, note: 'Bandingkan post pada usia setara di Analitik.' },
  Experiment: { available: true, note: 'Rancang hipotesis dan kriteria sukses di Eksperimen.' },
  Improve: { available: true, note: 'Catat keputusan dan pembelajaran di log eksperimen.' },
};

export default async function OverviewPage() {
  await connection();
  const db = getDb();
  const stats = getOverviewStats(db);
  const { timezone } = getAppSettings(db);
  const kpi = getPlatformKpis(db);

  return (
    <>
      <PageHeader
        title={APP_NAME}
        description="Turn content signals into smarter decisions. Data Anda tersimpan lokal di komputer ini."
        actions={
          <Link href="/episodes/new" className="btn btn-primary">
            Episode baru
          </Link>
        }
      />

      <section aria-labelledby="cycle-heading" className="mb-8">
        <h2 id="cycle-heading" className="mb-3 text-lg font-semibold">
          Siklus analisis
        </h2>
        <ol className="grid gap-3 md:grid-cols-4">
          {ANALYSIS_CYCLE.map((stage, i) => (
            <li key={stage} className="card p-4">
              <p className="text-sm text-muted">
                {String(i + 1).padStart(2, '0')}
              </p>
              <p className="font-semibold">{stage}</p>
              <p className="mt-1 text-sm text-muted">{CYCLE_STATUS[stage].note}</p>
              <p className="mt-2">
                <Badge tone={CYCLE_STATUS[stage].available ? 'success' : 'neutral'}>
                  {CYCLE_STATUS[stage].available ? 'Tersedia' : 'Belum tersedia'}
                </Badge>
              </p>
            </li>
          ))}
        </ol>
      </section>

      {stats.episodes === 0 ? (
        <EmptyState title="Belum ada data" action={{ href: '/episodes/new', label: 'Buat episode pertama' }}>
          Mulai dengan membuat episode, lalu tambahkan distribusi per platform (Facebook, YouTube, TikTok) dan catat
          snapshot metrik yang Anda ketahui. Metrik yang tidak diketahui dibiarkan kosong — bukan 0.
        </EmptyState>
      ) : (
        <>
          {kpi.metric ? <KpiRow metric={kpi.metric} window={kpi.window} kpis={kpi.kpis} timezone={timezone} /> : null}

          <section aria-labelledby="counts-heading" className="mb-8">
            <h2 id="counts-heading" className="mb-3 text-lg font-semibold">
              Data yang tercatat
            </h2>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                ['Episode', stats.episodes],
                ['Distribusi', stats.distributions],
                ['Snapshot', stats.snapshots],
              ].map(([label, n]) => (
                <div key={label} className="card p-4">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
            <p className="field-hint">Jumlah catatan, bukan angka performa. Performa ada di KPI di atas dan di Analitik.</p>
          </section>

          {stats.distributionsWithoutSnapshots > 0 || stats.distributionsWithoutPublishedAt > 0 ? (
            <section aria-labelledby="quality-heading" className="mb-8">
              <h2 id="quality-heading" className="mb-3 text-lg font-semibold">
                Kualitas data
              </h2>
              <Alert tone="warning" title="Riwayat belum lengkap">
                <ul className="list-disc space-y-1 pl-5">
                  {stats.distributionsWithoutSnapshots > 0 ? (
                    <li>{stats.distributionsWithoutSnapshots} distribusi belum punya snapshot metrik.</li>
                  ) : null}
                  {stats.distributionsWithoutPublishedAt > 0 ? (
                    <li>
                      {stats.distributionsWithoutPublishedAt} distribusi belum punya waktu terbit, sehingga usia post
                      tidak bisa dihitung.
                    </li>
                  ) : null}
                </ul>
              </Alert>
            </section>
          ) : null}

          {stats.runningExperiments.length > 0 || stats.recentDecisions.length > 0 ? (
            <section aria-labelledby="exp-heading" className="mb-8">
              <h2 id="exp-heading" className="mb-3 text-lg font-semibold">
                Eksperimen dan keputusan
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="card">
                  <h3 className="mb-2 font-semibold">Sedang berjalan</h3>
                  {stats.runningExperiments.length === 0 ? (
                    <p className="text-sm text-muted">Tidak ada eksperimen berjalan.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {stats.runningExperiments.map((x) => (
                        <li key={x.id}>
                          <Link href={`/experiments/${x.id}`} className="font-semibold text-primary underline underline-offset-2">
                            {x.title}
                          </Link>
                          <span className="block text-muted">
                            {x.primaryMetricLabel} @ {x.windowHours} j · {x.baselineCount} baseline, {x.variantCount} varian
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="card">
                  <h3 className="mb-2 font-semibold">Keputusan terbaru</h3>
                  {stats.recentDecisions.length === 0 ? (
                    <p className="text-sm text-muted">Belum ada eksperimen yang ditutup.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {stats.recentDecisions.map((x) => (
                        <li key={x.id}>
                          <Link href={`/experiments/${x.id}`} className="font-semibold text-primary underline underline-offset-2">
                            {x.title}
                          </Link>
                          <span className="block text-muted">
                            {x.decision ? DECISION_LABELS[x.decision] : '—'}
                            {x.endedAt ? ` · ${formatDateTime(x.endedAt, timezone)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <p className="field-hint">Hasil eksperimen bersifat indikasi dari data yang diamati, bukan bukti sebab-akibat.</p>
            </section>
          ) : null}

          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="mb-3 text-lg font-semibold">
              Episode terbaru diperbarui
            </h2>
            <ul className="card divide-y divide-line p-0">
              {stats.recentEpisodes.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <Link href={`/episodes/${e.id}`} className="font-semibold text-primary underline underline-offset-2">
                    {e.title}
                  </Link>
                  <span className="text-sm text-muted">
                    {e.distributionCount} distribusi · {e.snapshotCount} snapshot · diperbarui{' '}
                    {formatDateTime(e.updatedAt, timezone)} ({timezone})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

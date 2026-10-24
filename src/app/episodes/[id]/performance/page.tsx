import Link from 'next/link';
import { connection } from 'next/server';
import { TrendChart } from '@/components/charts/TrendChart';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { axisFormatter, distributionSeries } from '@/features/analytics/chart-data';
import { ChangeText, PLATFORM_COLORS, ResultStatus, ResultValue } from '@/features/analytics/components';
import { getDb } from '@/lib/db/connection';
import { firstParam, orNotFound, type SearchParams } from '@/lib/page-helpers';
import { getEpisodeDetail } from '@/lib/services/episodes';
import { getEpisodePerformance } from '@/lib/services/analytics';
import { formatDateTime, formatGap, formatPostAge } from '@/lib/time';

export const metadata = { title: 'Performa episode' };

export default async function EpisodePerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const rawMetric = firstParam(sp.metric);
  const db = getDb();
  const { episode } = orNotFound(() => getEpisodeDetail(db, id));
  const perf = getEpisodePerformance(db, id, rawMetric && /^[A-Za-z0-9_-]{1,80}$/.test(rawMetric) ? rawMetric : null);
  const { metric, timezone } = perf;

  return (
    <>
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { href: `/episodes/${id}`, label: episode.title }, { label: 'Performa' }]} />
      <PageHeader
        title={`Performa — ${episode.title}`}
        description="Nilai pada usia setara, tren per distribusi, dan perubahan antar snapshot. Tiap platform dibaca terpisah; metrik antar platform tidak otomatis setara."
        actions={
          <Link href={`/analytics?episode=${id}`} className="btn btn-secondary">
            Bandingkan di Analitik
          </Link>
        }
      />

      {!metric ? (
        <Alert tone="info">Belum ada metrik numerik aktif. Aktifkan atau buat metrik di Pengaturan → Metrik.</Alert>
      ) : (
        <>
          <form method="get" className="card mb-6 flex flex-wrap items-end gap-3" aria-label="Pilih metrik">
            <div className="min-w-56">
              <label htmlFor="metric" className="field-label">
                Metrik
              </label>
              <select id="metric" name="metric" defaultValue={metric.id} className="input">
                {perf.metricChoices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.unit}){m.platformName ? ` · ${m.platformName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Tampilkan
            </button>
            <p className="field-hint basis-full">
              Waktu dalam zona {timezone}. Definisi sumber metrik {metric.sourceDefinition ? 'tercatat' : 'belum dicatat'}.
            </p>
          </form>

          {perf.distributions.length === 0 ? (
            <EmptyState title="Tidak ada distribusi untuk metrik ini" action={{ href: `/episodes/${id}/distributions/new`, label: 'Tambah distribusi' }}>
              {metric.platformName ? `Metrik ini khusus ${metric.platformName}. ` : ''}Tambahkan distribusi atau pilih metrik lain.
            </EmptyState>
          ) : (
            perf.distributions.map((d) => {
              const title = `${d.distribution.platformName}${d.distribution.variantLabel ? ` — ${d.distribution.variantLabel}` : ''}`;
              const chart = distributionSeries(d.series, metric, d.windows.map((w) => w.window), timezone);
              return (
                <section key={d.distribution.distributionId} aria-labelledby={`d-${d.distribution.distributionId}`} className="mb-10">
                  <h2 id={`d-${d.distribution.distributionId}`} className="mb-1 text-xl font-semibold">
                    {title}
                  </h2>
                  <p className="mb-3 text-sm text-muted">
                    Terbit {d.distribution.publishedAt ? `${formatDateTime(d.distribution.publishedAt, timezone)} (${timezone})` : 'tidak diketahui — usia post tidak bisa dihitung'} ·{' '}
                    {d.series.length} snapshot ·{' '}
                    <Link href={`/episodes/${id}/distributions/${d.distribution.distributionId}`} className="text-primary underline">
                      timeline & entri snapshot
                    </Link>
                  </p>

                  <h3 className="mb-2 font-semibold">Nilai pada usia setara</h3>
                  <TableScroll label={`Nilai pada usia setara ${title}`}>
                    <table className="data-table">
                      <caption className="sr-only">
                        {metric.label} ({metric.unit}) pada tiap jendela usia untuk {title}.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Jendela usia</th>
                          <th scope="col" className="num">
                            {metric.label}
                            <span className="block text-xs font-normal text-muted">{metric.unit}</span>
                          </th>
                          <th scope="col">Usia aktual</th>
                          <th scope="col">Snapshot diambil</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.windows.map(({ window, result }) => (
                          <tr key={window.hours}>
                            <th scope="row" className="!bg-transparent font-normal">
                              {window.hours} jam ± {window.toleranceHours} jam
                            </th>
                            <td className="num">
                              <ResultValue result={result} metric={metric} />
                            </td>
                            <td>
                              {result.ok ? (
                                <>
                                  {formatPostAge(result.actualAgeHours * 3600)}
                                  <span className="block text-xs text-muted">
                                    {result.deltaHours === 0 ? 'tepat target' : `${result.deltaHours > 0 ? '+' : '−'}${Number(Math.abs(result.deltaHours).toFixed(1))} jam dari target`}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{result.ok ? formatDateTime(result.capturedAt, timezone) : '—'}</td>
                            <td>
                              <ResultStatus result={result} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>

                  <div className="mt-4">
                    <TrendChart
                      title={`${metric.label} terhadap usia post — ${title}`}
                      description={`Semua snapshot yang berlaku (snapshot yang sudah dikoreksi tidak digambar). Pita = jendela usia setara.${chart.unplaced > 0 ? ` ${chart.unplaced} snapshot tanpa usia post tidak digambar.` : ''}`}
                      points={chart.points}
                      xTicks={chart.xTicks}
                      bands={chart.bands}
                      color={PLATFORM_COLORS[d.distribution.platformId]}
                      xAxisLabel={chart.xAxisLabel}
                      yAxisLabel={`${metric.label} (${metric.unit})`}
                      formatY={axisFormatter(metric)}
                      tableXHeader="Usia post"
                      tableYHeader={`${metric.label} (${metric.unit})`}
                    />
                  </div>

                  {d.changes.length > 0 ? (
                    <div className="mt-4">
                      <h3 className="mb-2 font-semibold">Perubahan antar snapshot berurutan</h3>
                      <TableScroll label={`Perubahan antar snapshot ${title}`}>
                        <table className="data-table">
                          <caption className="sr-only">
                            Perubahan {metric.label} antara dua snapshot berurutan. Perubahan relatif tidak tersedia bila baseline 0 atau salah satu nilai tidak diketahui.
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Dari → ke ({timezone})</th>
                              <th scope="col">Jeda</th>
                              <th scope="col">Perubahan ({metric.unit})</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.changes.map((c) => (
                              <tr key={`${c.fromCapturedAt}-${c.toCapturedAt}`}>
                                <th scope="row" className="!bg-transparent font-normal">
                                  {formatDateTime(c.fromCapturedAt, timezone)} → {formatDateTime(c.toCapturedAt, timezone)}
                                </th>
                                <td>{formatGap(c.fromCapturedAt, c.toCapturedAt)}</td>
                                <td>
                                  <ChangeText change={c.change} metric={metric} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableScroll>
                      <p className="field-hint">
                        Perubahan menggambarkan selisih angka antar dua waktu, bukan penyebabnya. Metrik kumulatif atau
                        bukan tergantung definisi platform.
                      </p>
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </>
      )}
    </>
  );
}

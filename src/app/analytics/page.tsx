import Link from 'next/link';
import { connection } from 'next/server';
import { TrendChart } from '@/components/charts/TrendChart';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { axisFormatter, platformTrend } from '@/features/analytics/chart-data';
import { PLATFORM_COLORS, ResultStatus, ResultValue, known, metricBasis } from '@/features/analytics/components';
import { parseAnalyticsParams, queryToSearch } from '@/features/analytics/params';
import { getDb } from '@/lib/db/connection';
import { REASON_LABELS } from '@/lib/analytics/equivalent-age';
import { PLATFORM_IDS } from '@/lib/domain/types';
import { formatMetricValue } from '@/lib/metrics/format';
import type { SearchParams } from '@/lib/page-helpers';
import type { MetricDefinitionRow } from '@/lib/repositories/metric-definitions';
import { getAnalytics, rowValue, type AnalyticsRow, type SortKey } from '@/lib/services/analytics';
import { listEpisodes, listTags } from '@/lib/services/episodes';
import { formatDateTime, formatPostAge } from '@/lib/time';

export const metadata = { title: 'Analitik' };

const PLATFORM_NAMES = { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' } as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const { query, ignored } = parseAnalyticsParams(sp);
  const db = getDb();
  const report = getAnalytics(db, query);
  const { metric, window, timezone } = report;
  const episodes = listEpisodes(db);
  const tags = listTags(db);
  const hasAnyEpisode = episodes.length > 0;
  const filtered = Boolean(query.platformId || query.episodeId || query.tag || query.from || query.to);

  const sortHref = (key: SortKey) => {
    const dir = query.sort === key && query.dir === 'desc' ? 'asc' : 'desc';
    return `/analytics${queryToSearch(query, { sort: key, dir })}`;
  };
  const ariaSort = (key: SortKey) => (query.sort === key ? (query.dir === 'asc' ? 'ascending' : 'descending') : undefined);

  return (
    <>
      <PageHeader
        title="Analitik"
        description="Perbandingan pada usia post yang setara. Angka antar platform tidak dijumlahkan, dan nilai yang tidak diketahui tidak dihitung sebagai 0."
      />

      <form method="get" action="/analytics" aria-label="Filter analitik" className="card mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="metric" className="field-label">
              Metrik
            </label>
            <select id="metric" name="metric" defaultValue={metric?.id ?? ''} className="input">
              {report.metricChoices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.unit}){m.platformName ? ` · ${m.platformName}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="window" className="field-label">
              Usia target
            </label>
            <select id="window" name="window" defaultValue={String(window.hours)} className="input">
              {report.windows.map((w) => (
                <option key={w.hours} value={w.hours}>
                  {w.hours} jam ± {w.toleranceHours} jam
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="platform" className="field-label">
              Platform
            </label>
            <select id="platform" name="platform" defaultValue={query.platformId ?? ''} className="input">
              <option value="">Semua platform (terpisah)</option>
              {PLATFORM_IDS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_NAMES[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="episode" className="field-label">
              Episode
            </label>
            <select id="episode" name="episode" defaultValue={query.episodeId ?? ''} className="input">
              <option value="">Semua episode</option>
              {episodes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tag" className="field-label">
              Tag
            </label>
            <select id="tag" name="tag" defaultValue={query.tag ?? ''} className="input">
              <option value="">Semua tag</option>
              {tags.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="field-label">
              Terbit dari
            </label>
            <input id="from" name="from" type="date" defaultValue={query.from ?? ''} className="input" />
          </div>
          <div>
            <label htmlFor="to" className="field-label">
              Terbit sampai
            </label>
            <input id="to" name="to" type="date" defaultValue={query.to ?? ''} className="input" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-primary">
              Terapkan
            </button>
            {filtered ? (
              <Link href={`/analytics${queryToSearch({ ...query, platformId: null, episodeId: null, tag: null, from: null, to: null })}`} className="btn btn-secondary">
                Hapus filter
              </Link>
            ) : null}
          </div>
        </div>
        <p className="field-hint">Tanggal dibaca di zona waktu {timezone}. Filter tanggal memakai waktu terbit.</p>
      </form>

      {ignored.length > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title="Filter diabaikan" live="status">
            Nilai tidak valid untuk: {ignored.join(', ')}.
          </Alert>
        </div>
      ) : null}
      {report.notes.map((n) => (
        <div key={n} className="mb-4">
          <Alert tone="info">{n}</Alert>
        </div>
      ))}

      {!hasAnyEpisode ? (
        <EmptyState title="Belum ada data untuk dianalisis" action={{ href: '/episodes/new', label: 'Buat episode pertama' }}>
          Catat episode, distribusi, dan snapshot terlebih dahulu. Analitik membandingkan post pada usia yang setara.
        </EmptyState>
      ) : !metric ? null : report.rows.length === 0 ? (
        <EmptyState title={filtered ? 'Tidak ada distribusi yang cocok dengan filter' : 'Belum ada distribusi'} action={{ href: '/analytics', label: 'Atur ulang' }}>
          Ubah filter, atau tambahkan distribusi pada episode.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="basis-heading" className="card mb-6">
            <h2 id="basis-heading" className="text-lg font-semibold">
              Basis perbandingan
            </h2>
            <p className="mt-1">{metricBasis(metric, window)}.</p>
            <p className="field-hint">
              Dibaca dari snapshot yang paling dekat dengan usia target di dalam toleransi; snapshot yang sudah dikoreksi
              tidak dipakai. Jika tidak ada snapshot yang cocok, nilainya dinyatakan tidak tersedia — tidak diganti
              dengan snapshot di usia lain. Provenance: snapshot manual; definisi sumber metrik{' '}
              {metric.sourceDefinition ? 'tercatat' : 'belum dicatat'}.
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted">Distribusi dalam filter</dt>
                <dd className="text-2xl font-bold">{report.quality.total}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Sebanding pada usia target</dt>
                <dd className="text-2xl font-bold">{report.quality.comparable}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Tidak sebanding</dt>
                <dd>
                  {Object.keys(report.quality.byReason).length === 0 ? (
                    '—'
                  ) : (
                    <ul className="text-sm">
                      {Object.entries(report.quality.byReason).map(([reason, n]) => (
                        <li key={reason}>
                          {n} × {REASON_LABELS[reason as keyof typeof REASON_LABELS]}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {report.groups.map((g) => {
            const { points, xTicks } = platformTrend(g.trend, metric, window, timezone);
            return (
              <section key={g.platformId} aria-labelledby={`p-${g.platformId}`} className="mb-8">
                <h2 id={`p-${g.platformId}`} className="mb-3 text-xl font-semibold">
                  {g.platformName}
                </h2>
                <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="card p-4">
                    <dt className="text-sm text-muted">Sebanding</dt>
                    <dd className="text-2xl font-bold">
                      {g.comparable} <span className="text-base font-normal text-muted">dari {g.total}</span>
                    </dd>
                  </div>
                  {(
                    [
                      ['Median', g.summary.median],
                      ['Terendah', g.summary.min],
                      ['Tertinggi', g.summary.max],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="card p-4">
                      <dt className="text-sm text-muted">
                        {label} ({metric.label}, {window.hours} j)
                      </dt>
                      <dd className="text-2xl font-bold">{v === null ? '—' : formatMetricValue(metric, known(v)).text}</dd>
                    </div>
                  ))}
                </dl>
                {g.summary.n === 0 ? (
                  <p className="field-hint mb-3">Belum ada post sebanding di platform ini, jadi tidak ada ringkasan (bukan 0).</p>
                ) : g.summary.n < 5 ? (
                  <p className="field-hint mb-3">Median dan rentang dari {g.summary.n} post hanya gambaran awal.</p>
                ) : null}

                <TrendChart
                  title={`${metric.label} pada usia ${window.hours} jam — ${g.platformName}`}
                  description={`Satu titik per post (urut waktu terbit, ${timezone}); toleransi ± ${window.toleranceHours} jam. ${g.undated > 0 ? `${g.undated} post tanpa waktu terbit tidak digambar.` : ''}`}
                  points={points}
                  xTicks={xTicks}
                  color={PLATFORM_COLORS[g.platformId]}
                  xAxisLabel="Tanggal terbit (bulan-hari)"
                  yAxisLabel={`${metric.label} (${metric.unit})`}
                  formatY={axisFormatter(metric)}
                  tableXHeader="Terbit — post"
                  tableYHeader={`${metric.label} (${metric.unit})`}
                />

                <div className="mt-4">
                  {g.top.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <RankList title={`Teratas — ${g.platformName}`} rows={g.top} metric={metric} />
                      {g.bottom.length > 0 ? <RankList title={`Terbawah — ${g.platformName}`} rows={g.bottom} metric={metric} /> : null}
                    </div>
                  ) : null}
                  {g.rankingNote ? <p className="field-hint">{g.rankingNote}</p> : null}
                  {g.top.length > 0 ? (
                    <p className="field-hint">Peringkat adalah deskripsi nilai, bukan penjelasan sebab. Tag, format, atau waktu terbit belum terbukti memengaruhi hasil.</p>
                  ) : null}
                </div>
              </section>
            );
          })}

          <section aria-labelledby="table-heading">
            <h2 id="table-heading" className="mb-3 text-xl font-semibold">
              Semua distribusi
            </h2>
            <TableScroll label="Tabel perbandingan distribusi">
              <table className="data-table">
                <caption className="sr-only">
                  {metricBasis(metric, window)}. Satu baris per distribusi; platform tidak digabung. Waktu dalam zona {timezone}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" aria-sort={ariaSort('episode')}>
                      <Link href={sortHref('episode')} className="underline underline-offset-2">
                        Episode
                      </Link>
                    </th>
                    <th scope="col" aria-sort={ariaSort('platform')}>
                      <Link href={sortHref('platform')} className="underline underline-offset-2">
                        Platform
                      </Link>
                    </th>
                    <th scope="col" aria-sort={ariaSort('published')}>
                      <Link href={sortHref('published')} className="underline underline-offset-2">
                        Terbit
                      </Link>
                    </th>
                    <th scope="col" className="num" aria-sort={ariaSort('value')}>
                      <Link href={sortHref('value')} className="underline underline-offset-2">
                        {metric.label}
                      </Link>
                      <span className="block text-xs font-normal text-muted">
                        {metric.unit} @ {window.hours} j
                      </span>
                    </th>
                    <th scope="col" aria-sort={ariaSort('age')}>
                      <Link href={sortHref('age')} className="underline underline-offset-2">
                        Usia aktual
                      </Link>
                      <span className="block text-xs font-normal text-muted">selisih dari target</span>
                    </th>
                    <th scope="col">Snapshot diambil</th>
                    <th scope="col">Status</th>
                    <th scope="col">Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.distributionId}>
                      <th scope="row" className="!bg-transparent font-semibold">
                        <Link href={`/episodes/${r.episodeId}/performance${queryToSearch({ ...query, metricId: metric.id })}`} className="text-primary underline underline-offset-2">
                          {r.episodeTitle}
                        </Link>
                      </th>
                      <td>
                        <Link href={`/episodes/${r.episodeId}/distributions/${r.distributionId}`} className="underline underline-offset-2">
                          {r.platformName}
                          {r.variantLabel ? ` — ${r.variantLabel}` : ''}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{r.publishedAt ? formatDateTime(r.publishedAt, timezone) : 'Tidak diketahui'}</td>
                      <td className="num">
                        <ResultValue result={r.result} metric={metric} />
                      </td>
                      <td>
                        {r.result.ok ? (
                          <>
                            {formatPostAge(r.result.actualAgeHours * 3600)}
                            <span className="block text-xs text-muted">
                              {r.result.deltaHours === 0 ? 'tepat target' : `${r.result.deltaHours > 0 ? '+' : '−'}${Number(Math.abs(r.result.deltaHours).toFixed(1))} jam`}
                              {r.result.candidateCount > 1 ? ` · ${r.result.candidateCount} kandidat` : ''}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap">{r.result.ok ? formatDateTime(r.result.capturedAt, timezone) : '—'}</td>
                      <td>
                        <ResultStatus result={r.result} />
                      </td>
                      <td className="text-xs">
                        {r.snapshotSource ?? '—'}
                        <span className="block text-muted">definisi sumber {metric.sourceDefinition ? 'tercatat' : 'belum dicatat'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <p className="field-hint">
              Baris tanpa nilai ditaruh di bawah saat diurutkan menurut nilai/usia; “—” berarti tidak diketahui atau tidak
              sebanding, bukan 0.
            </p>
          </section>
        </>
      )}
    </>
  );
}

function RankList({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: AnalyticsRow[];
  metric: MetricDefinitionRow;
}) {
  return (
    <div className="card">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <ol className="space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.distributionId} className="flex justify-between gap-3">
            <span>
              {i + 1}. {r.episodeTitle}
              {r.variantLabel ? ` — ${r.variantLabel}` : ''}
            </span>
            <span className="font-semibold tabular-nums">{formatMetricValue(metric, known(rowValue(r)!)).text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

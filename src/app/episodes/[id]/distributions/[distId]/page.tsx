import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Alert, Badge, EmptyState, Notice } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { getDb } from '@/lib/db/connection';
import { DISTRIBUTION_STATUS_LABELS } from '@/lib/domain/types';
import { formatMetricValue } from '@/lib/metrics/format';
import { orNotFound, type SearchParams } from '@/lib/page-helpers';
import { getEpisodeDetail } from '@/lib/services/episodes';
import { getAppSettings } from '@/lib/services/settings';
import { getDistributionTimeline } from '@/lib/services/snapshots';
import { formatDateTime, formatGap, formatPostAge } from '@/lib/time';

export const metadata = { title: 'Timeline snapshot' };

export default async function DistributionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; distId: string }>;
  searchParams: SearchParams;
}) {
  await connection();
  const { id, distId } = await params;
  const sp = await searchParams;
  const db = getDb();
  const { timezone } = getAppSettings(db);
  const timeline = orNotFound(() => getDistributionTimeline(db, distId));
  const { distribution: d } = timeline;
  if (d.episodeId !== id) notFound();
  const { episode } = orNotFound(() => getEpisodeDetail(db, id));

  const title = d.variantLabel ? `${d.platformName} — ${d.variantLabel}` : d.platformName;
  const snapshots = timeline.snapshots;
  const capturedById = new Map(snapshots.map((s) => [s.snapshot.id, s.snapshot.capturedAt]));
  const unknownAgeCount = snapshots.filter((s) => s.snapshot.postAgeSeconds === null).length;
  const first = snapshots[0]?.snapshot.capturedAt;
  const last = snapshots[snapshots.length - 1]?.snapshot.capturedAt;

  return (
    <>
      <Notice code={sp.notice} />
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { href: `/episodes/${id}`, label: episode.title }, { label: title }]} />
      <PageHeader
        title={`${episode.title} — ${title}`}
        actions={
          <>
            <Link href={`/episodes/${id}/distributions/${distId}/snapshots/new`} className="btn btn-primary">
              Tambah snapshot
            </Link>
            <Link href={`/episodes/${id}/performance`} className="btn btn-secondary">
              Performa
            </Link>
            <Link href={`/episodes/${id}/distributions/${distId}/edit`} className="btn btn-secondary">
              Ubah
            </Link>
            <Link href={`/episodes/${id}/distributions/${distId}/delete`} className="btn btn-secondary">
              Hapus…
            </Link>
          </>
        }
      />

      <dl className="card mb-6 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted">Platform</dt>
          <dd>{d.platformName}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Status</dt>
          <dd>{DISTRIBUTION_STATUS_LABELS[d.status]}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Terbit ({timezone})</dt>
          <dd>{d.publishedAt ? formatDateTime(d.publishedAt, timezone) : 'Tidak diketahui'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">URL post</dt>
          <dd className="break-all">
            {d.postUrl && /^https?:\/\//i.test(d.postUrl) ? (
              <a href={d.postUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {d.postUrl}
              </a>
            ) : (
              (d.postUrl ?? '—')
            )}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">
          Timeline snapshot
        </h2>

        {snapshots.length === 0 ? (
          <EmptyState
            title="Belum ada snapshot"
            action={{ href: `/episodes/${id}/distributions/${distId}/snapshots/new`, label: 'Tambah snapshot pertama' }}
          >
            Snapshot adalah angka yang Anda baca dari dasbor platform pada satu waktu. Catat hanya metrik yang Anda
            ketahui; yang tidak diketahui dibiarkan kosong.
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {snapshots.length} snapshot, dari {formatDateTime(first, timezone)} sampai {formatDateTime(last, timezone)} (
              {timezone}
              {first && last && snapshots.length > 1 ? `; rentang ${formatGap(first, last)}` : ''}).
              {unknownAgeCount > 0
                ? ` ${unknownAgeCount} snapshot tanpa usia post (waktu terbit tidak diketahui saat dicatat).`
                : ''}{' '}
              Jeda antar snapshot tidak selalu teratur.
            </p>

            {timeline.metricsMissingSource.length > 0 ? (
              <div className="mb-4">
                <Alert tone="warning" title="Provenance belum lengkap">
                  {timeline.metricsMissingSource.length} metrik aktif belum punya definisi sumber, jadi arti angkanya
                  di platform belum tercatat.{' '}
                  <Link href="/settings/metrics" className="text-primary underline">
                    Lengkapi di Pengaturan → Metrik
                  </Link>
                  .
                </Alert>
              </div>
            ) : null}

            <TableScroll label={`Timeline snapshot ${title}`}>
              <table className="data-table">
                <caption className="sr-only">
                  Snapshot metrik {title}, urut dari yang terlama. Sel “—” berarti tidak diketahui; “0” adalah nilai nol
                  yang terukur; “N/A” berarti tidak tersedia di platform.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Waktu pengambilan ({timezone})</th>
                    <th scope="col">Usia post</th>
                    {timeline.metrics.map((m) => (
                      <th key={m.id} scope="col" className="num" title={m.sourceDefinition ?? 'Definisi sumber belum dicatat'}>
                        {m.label}
                        <span className="block text-xs font-normal text-muted">
                          {m.unit}
                          {m.platformName ? ` · ${m.platformName}` : ''}
                          {!m.isActive ? ' · nonaktif' : ''}
                        </span>
                      </th>
                    ))}
                    <th scope="col">Catatan</th>
                    <th scope="col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => {
                    const supersededBy = s.supersededBy;
                    const corrects = s.snapshot.supersedesSnapshotId;
                    return (
                      <tr key={s.snapshot.id} className={supersededBy ? 'text-muted' : undefined}>
                        <th scope="row" className="!bg-transparent font-normal">
                          <span className="font-semibold">{formatDateTime(s.snapshot.capturedAt, timezone)}</span>
                          {s.gapFromPrevious ? (
                            <span className="block text-xs text-muted">+{s.gapFromPrevious} dari snapshot sebelumnya</span>
                          ) : null}
                          <span className="mt-1 flex flex-wrap gap-1">
                            {supersededBy ? (
                              <Badge tone="warning">
                                Sudah dikoreksi{capturedById.get(supersededBy) ? ` (${formatDateTime(capturedById.get(supersededBy), timezone)})` : ''}
                              </Badge>
                            ) : null}
                            {corrects ? (
                              <Badge tone="info">
                                Mengoreksi snapshot {formatDateTime(capturedById.get(corrects), timezone)}
                              </Badge>
                            ) : null}
                          </span>
                        </th>
                        <td className="whitespace-nowrap">{formatPostAge(s.snapshot.postAgeSeconds)}</td>
                        {timeline.metrics.map((m) => {
                          const f = formatMetricValue(m, s.values.get(m.id));
                          return (
                            <td key={m.id} className="num" title={f.description}>
                              <span aria-hidden="true">{f.text}</span>
                              <span className="sr-only">{f.description}</span>
                            </td>
                          );
                        })}
                        <td className="max-w-64 whitespace-pre-wrap">{s.snapshot.note ?? '—'}</td>
                        <td>
                          {supersededBy ? (
                            '—'
                          ) : (
                            <Link
                              href={`/episodes/${id}/distributions/${distId}/snapshots/new?supersedes=${s.snapshot.id}`}
                              className="text-primary underline"
                            >
                              Koreksi
                              <span className="sr-only"> snapshot {formatDateTime(s.snapshot.capturedAt, timezone)}</span>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            {timeline.metricsWithoutValues.length > 0 ? (
              <p className="field-hint">
                Belum ada nilai tercatat (tidak diketahui) untuk:{' '}
                {timeline.metricsWithoutValues.map((m) => m.label).join(', ')}.
              </p>
            ) : null}
            <p className="field-hint">
              Snapshot bersifat append-only: tidak diedit atau dihapus. Untuk memperbaiki salah ketik, buat snapshot
              pengganti lewat “Koreksi”. Angka dari platform berbeda tidak otomatis setara; jangan dijumlahkan.
            </p>
          </>
        )}
      </section>
    </>
  );
}

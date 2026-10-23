import Link from 'next/link';
import { connection } from 'next/server';
import { Badge, EmptyState, Notice } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { getDb } from '@/lib/db/connection';
import { DISTRIBUTION_STATUS_LABELS, PLATFORM_IDS } from '@/lib/domain/types';
import { orNotFound, type SearchParams } from '@/lib/page-helpers';
import { getEpisodeDetail } from '@/lib/services/episodes';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  try {
    return { title: getEpisodeDetail(getDb(), id).episode.title };
  } catch {
    return { title: 'Episode' };
  }
}

export default async function EpisodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const { timezone } = getAppSettings(db);
  const { episode, tags, distributions } = orNotFound(() => getEpisodeDetail(db, id));
  const present = new Set(distributions.map((d) => d.platformId));
  const missingPlatforms = PLATFORM_IDS.filter((p) => !present.has(p));

  const meta: [string, string][] = [
    ['Kode episode', episode.episodeCode ?? '—'],
    ['Judul kerja', episode.workingTitle ?? '—'],
    ['Format', episode.format ?? '—'],
    [
      'Durasi',
      episode.durationSeconds === null
        ? '—'
        : `${Math.floor(episode.durationSeconds / 60)}:${String(episode.durationSeconds % 60).padStart(2, '0')} (${episode.durationSeconds} detik)`,
    ],
    ['Dibuat', `${formatDateTime(episode.createdAt, timezone)} (${timezone})`],
    ['Diperbarui', `${formatDateTime(episode.updatedAt, timezone)} (${timezone})`],
  ];

  return (
    <>
      <Notice code={sp.notice} />
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { label: episode.title }]} />
      <PageHeader
        title={episode.title}
        actions={
          <>
            <Link href={`/episodes/${id}/distributions/new`} className="btn btn-primary">
              Tambah distribusi
            </Link>
            <Link href={`/episodes/${id}/edit`} className="btn btn-secondary">
              Ubah
            </Link>
            <Link href={`/episodes/${id}/delete`} className="btn btn-secondary">
              Hapus…
            </Link>
          </>
        }
      />

      <section aria-labelledby="meta-heading" className="card mb-6">
        <h2 id="meta-heading" className="mb-3 text-lg font-semibold">
          Detail
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">Tag</dt>
            <dd className="flex flex-wrap gap-1">
              {tags.length === 0 ? '—' : tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
            </dd>
          </div>
          {episode.premise ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Premis</dt>
              <dd className="whitespace-pre-wrap">{episode.premise}</dd>
            </div>
          ) : null}
          {episode.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Catatan</dt>
              <dd className="whitespace-pre-wrap">{episode.notes}</dd>
            </div>
          ) : null}
        </dl>
        {episode.scriptText ? (
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold">Naskah</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm">{episode.scriptText}</p>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="dist-heading">
        <h2 id="dist-heading" className="mb-3 text-lg font-semibold">
          Distribusi per platform
        </h2>
        {distributions.length === 0 ? (
          <EmptyState title="Belum ada distribusi" action={{ href: `/episodes/${id}/distributions/new`, label: 'Tambah distribusi' }}>
            Tambahkan satu distribusi untuk setiap platform tempat episode ini terbit.
          </EmptyState>
        ) : (
          <>
            <TableScroll label="Distribusi episode">
              <table className="data-table">
                <caption className="sr-only">Distribusi episode per platform. Waktu dalam zona {timezone}.</caption>
                <thead>
                  <tr>
                    <th scope="col">Platform</th>
                    <th scope="col">Status</th>
                    <th scope="col">Terbit ({timezone})</th>
                    <th scope="col" className="num">
                      Snapshot
                    </th>
                    <th scope="col">Snapshot terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((d) => (
                    <tr key={d.id}>
                      <th scope="row" className="!bg-transparent font-semibold">
                        <Link
                          href={`/episodes/${id}/distributions/${d.id}`}
                          className="text-primary underline underline-offset-2"
                        >
                          {d.platformName}
                          {d.variantLabel ? ` — ${d.variantLabel}` : ''}
                        </Link>
                      </th>
                      <td>{DISTRIBUTION_STATUS_LABELS[d.status]}</td>
                      <td>{d.publishedAt ? formatDateTime(d.publishedAt, timezone) : 'Tidak diketahui'}</td>
                      <td className="num">{d.snapshotCount}</td>
                      <td>{d.latestCapturedAt ? formatDateTime(d.latestCapturedAt, timezone) : 'Belum ada'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {missingPlatforms.length > 0 ? (
              <p className="field-hint">
                Belum ada distribusi untuk: {missingPlatforms.map((p) => p[0]!.toUpperCase() + p.slice(1)).join(', ')}.
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

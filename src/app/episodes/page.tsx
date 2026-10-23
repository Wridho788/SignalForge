import Link from 'next/link';
import { connection } from 'next/server';
import { EmptyState, Badge, Notice } from '@/components/ui/feedback';
import { PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { getDb } from '@/lib/db/connection';
import { firstParam, type SearchParams } from '@/lib/page-helpers';
import { listEpisodes, listTags } from '@/lib/services/episodes';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime } from '@/lib/time';

export const metadata = { title: 'Episode' };

export default async function EpisodesPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const q = firstParam(sp.q)?.trim().slice(0, 100) || null;
  const tag = firstParam(sp.tag)?.trim().slice(0, 40) || null;

  const db = getDb();
  const { timezone } = getAppSettings(db);
  const tags = listTags(db);
  const episodes = listEpisodes(db, { q, tag });
  const filtered = Boolean(q || tag);
  const total = filtered ? listEpisodes(db).length : episodes.length;

  return (
    <>
      <Notice code={sp.notice} />
      <PageHeader
        title="Episode"
        description="Setiap episode bisa punya distribusi di beberapa platform."
        actions={
          <Link href="/episodes/new" className="btn btn-primary">
            Episode baru
          </Link>
        }
      />

      {total > 0 ? (
        <form method="get" action="/episodes" role="search" aria-label="Cari episode" className="card mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="field-label">
              Cari judul / kode
            </label>
            <input id="q" name="q" type="search" defaultValue={q ?? ''} maxLength={100} className="input" />
          </div>
          <div className="min-w-40">
            <label htmlFor="tag" className="field-label">
              Tag
            </label>
            <select id="tag" name="tag" defaultValue={tag ?? ''} className="input">
              <option value="">Semua tag</option>
              {tags.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.episodeCount})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            Terapkan
          </button>
          {filtered ? (
            <Link href="/episodes" className="btn btn-secondary">
              Hapus filter
            </Link>
          ) : null}
        </form>
      ) : null}

      {episodes.length === 0 ? (
        filtered ? (
          <EmptyState title="Tidak ada episode yang cocok" action={{ href: '/episodes', label: 'Hapus filter' }}>
            Coba kata kunci atau tag lain.
          </EmptyState>
        ) : (
          <EmptyState title="Belum ada episode" action={{ href: '/episodes/new', label: 'Buat episode pertama' }}>
            Episode adalah konten yang Anda terbitkan. Setelah dibuat, tambahkan distribusi per platform.
          </EmptyState>
        )
      ) : (
        <TableScroll label="Daftar episode">
          <table className="data-table">
            <caption className="sr-only">
              Episode, diurutkan dari yang terakhir diperbarui. Waktu dalam zona {timezone}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Judul</th>
                <th scope="col">Kode</th>
                <th scope="col">Tag</th>
                <th scope="col" className="num">
                  Distribusi
                </th>
                <th scope="col" className="num">
                  Snapshot
                </th>
                <th scope="col">Diperbarui ({timezone})</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="!bg-transparent font-semibold">
                    <Link href={`/episodes/${e.id}`} className="text-primary underline underline-offset-2">
                      {e.title}
                    </Link>
                  </th>
                  <td>{e.episodeCode ?? '—'}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {e.tags.length === 0 ? '—' : e.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
                    </span>
                  </td>
                  <td className="num">{e.distributionCount}</td>
                  <td className="num">{e.snapshotCount}</td>
                  <td>{formatDateTime(e.updatedAt, timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}

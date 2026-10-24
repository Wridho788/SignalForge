import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout-bits';
import { getDb } from '@/lib/db/connection';
import { PLATFORM_IDS, type PlatformId } from '@/lib/domain/types';
import { firstParam, type SearchParams } from '@/lib/page-helpers';
import { listEpisodes } from '@/lib/services/episodes';
import { listExportRows } from '@/lib/repositories/exports';
import { CSV_COLUMNS } from '@/lib/csv/format';

export const metadata = { title: 'Ekspor CSV' };

const PLATFORM_NAMES: Record<PlatformId, string> = { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };

export default async function ExportPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const rawPlatform = firstParam(sp.platform);
  const platformId = (PLATFORM_IDS as readonly string[]).includes(rawPlatform ?? '') ? (rawPlatform as PlatformId) : null;
  const rawEpisode = firstParam(sp.episode);
  const episodeId = rawEpisode && /^[A-Za-z0-9-]{1,80}$/.test(rawEpisode) ? rawEpisode : null;

  const db = getDb();
  const episodes = listEpisodes(db);
  const rows = listExportRows(db, { platformId, episodeId });
  const measurements = rows.filter((r) => r.metricKey).length;

  const qs = new URLSearchParams();
  if (platformId) qs.set('platform', platformId);
  if (episodeId) qs.set('episode', episodeId);
  const href = `/imports/export/download${qs.size ? `?${qs}` : ''}`;

  return (
    <>
      <PageHeader title="Ekspor CSV" description="Unduh data dalam format yang sama dengan template impor. Untuk salinan lengkap seluruh data, gunakan Cadangan." />

      <form method="get" action="/imports/export" aria-label="Pilih data untuk diekspor" className="card mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <label htmlFor="platform" className="field-label">
            Platform
          </label>
          <select id="platform" name="platform" defaultValue={platformId ?? ''} className="input">
            <option value="">Semua platform</option>
            {PLATFORM_IDS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_NAMES[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56">
          <label htmlFor="episode" className="field-label">
            Episode
          </label>
          <select id="episode" name="episode" defaultValue={episodeId ?? ''} className="input">
            <option value="">Semua episode</option>
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          Terapkan pilihan
        </button>
      </form>

      <section aria-labelledby="export-heading" className="card space-y-3">
        <h2 id="export-heading" className="text-lg font-semibold">
          Yang akan diekspor
        </h2>
        <p>
          <strong>{measurements}</strong> nilai metrik dari {new Set(rows.map((r) => `${r.episodeTitle}|${r.platformId}|${r.variantLabel}`)).size}{' '}
          distribusi{platformId ? ` (${PLATFORM_NAMES[platformId]})` : ''}.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Hanya snapshot yang berlaku; snapshot yang sudah dikoreksi tidak diekspor (riwayat lengkap ada di Cadangan).</li>
          <li>Metrik yang tidak diketahui tidak punya baris; angka 0 tetap 0; rasio dalam persen; waktu dalam UTC (ISO-8601, Z).</li>
          <li>
            Sel teks yang diawali <code>= + - @</code> diberi awalan <code>&apos;</code> agar tidak dijalankan sebagai rumus di spreadsheet; angka tidak diubah.
            Impor membalikkan awalan itu.
          </li>
          <li>
            Tidak termasuk: naskah, catatan episode, tag, status distribusi, dan eksperimen. Kolom: <code>{CSV_COLUMNS.join(', ')}</code>.
          </li>
        </ul>
        {rows.length === 0 ? (
          <Alert tone="info">Belum ada data untuk diekspor dengan pilihan ini.</Alert>
        ) : (
          <a href={href} className="btn btn-primary" download>
            Unduh CSV
          </a>
        )}
      </section>
    </>
  );
}

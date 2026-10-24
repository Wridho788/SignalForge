import Link from 'next/link';
import { connection } from 'next/server';
import { Badge, Notice } from '@/components/ui/feedback';
import { PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { uploadImportAction } from '@/features/data/actions';
import { FileUploadForm } from '@/features/data/forms';
import { getDb } from '@/lib/db/connection';
import type { SearchParams } from '@/lib/page-helpers';
import { recentImports } from '@/lib/services/imports';
import { getAppSettings } from '@/lib/services/settings';
import { CSV_COLUMNS } from '@/lib/csv/format';
import { formatDateTime } from '@/lib/time';

export const metadata = { title: 'Impor CSV' };

const STATUS_LABEL = { previewed: 'Menunggu konfirmasi', committed: 'Selesai', failed: 'Gagal (dibatalkan)', cancelled: 'Dibatalkan' } as const;
const STATUS_TONE = { previewed: 'warning', committed: 'success', failed: 'danger', cancelled: 'neutral' } as const;

export default async function ImportsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const { timezone } = getAppSettings(db);
  const jobs = recentImports(db);

  return (
    <>
      <Notice code={sp.notice} />
      <PageHeader
        title="Impor CSV"
        description="Impor snapshot metrik dari file CSV. Anda akan melihat pratinjau dan semua kesalahan per baris sebelum ada yang disimpan."
        actions={
          <Link href="/imports/template" prefetch={false} className="btn btn-secondary">
            Unduh template CSV
          </Link>
        }
      />

      <section aria-labelledby="upload-heading" className="card mb-6">
        <h2 id="upload-heading" className="mb-3 text-lg font-semibold">
          Unggah file
        </h2>
        <FileUploadForm
          action={uploadImportAction}
          label="File CSV (UTF-8)"
          accept=".csv,text/csv"
          hint="Maksimal 2 MB dan 5.000 baris. Mengunggah belum mengubah data: Anda meninjau dulu, lalu mengonfirmasi."
          submitLabel="Pratinjau impor"
        />
      </section>

      <section aria-labelledby="format-heading" className="card mb-6">
        <h2 id="format-heading" className="mb-2 text-lg font-semibold">
          Format (template v1)
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            Satu baris = satu nilai metrik. Baris dengan <code>captured_at</code> dan <code>metric_key</code> yang sama
            digabung menjadi satu snapshot.
          </li>
          <li>
            Kolom: <code>{CSV_COLUMNS.join(', ')}</code>.
          </li>
          <li>
            <strong>Kosong berarti tidak diketahui, bukan 0.</strong> Untuk nilai tidak diketahui, jangan sertakan barisnya. Nol hanya untuk
            angka yang terukur nol (<code>value_state=known</code>, <code>value=0</code>).
          </li>
          <li>
            Rasio ditulis sebagai persentase 0–100 (mis. <code>4.5</code>). Desimal pakai titik atau koma; tanpa pemisah ribuan.
          </li>
          <li>
            Waktu: ISO-8601 dengan <code>Z</code>/offset (mis. <code>2026-10-02T10:00:00+07:00</code>), atau{' '}
            <code>YYYY-MM-DD HH:mm</code> yang dibaca di zona waktu {timezone}.
          </li>
          <li>
            Baris tanpa <code>captured_at</code> dan <code>metric_key</code> hanya membuat episode/distribusi (tanpa pengukuran).
          </li>
          <li>Pencocokan: episode lewat <code>episode_code</code> (atau judul persis), distribusi lewat platform + label varian. Data yang sudah ada tidak diubah.</li>
        </ul>
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          Riwayat impor
        </h2>
        {jobs.length === 0 ? (
          <p className="rounded-control border border-dashed border-line p-4 text-sm text-muted">Belum ada impor.</p>
        ) : (
          <TableScroll label="Riwayat impor">
            <table className="data-table">
              <caption className="sr-only">Riwayat impor CSV. Waktu dalam zona {timezone}.</caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Status</th>
                  <th scope="col">Waktu ({timezone})</th>
                  <th scope="col" className="num">Baris</th>
                  <th scope="col" className="num">Valid</th>
                  <th scope="col" className="num">Ditolak</th>
                  <th scope="col" className="num">Snapshot dibuat</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <th scope="row" className="!bg-transparent font-semibold">
                      <Link href={`/imports/${j.id}`} className="text-primary underline underline-offset-2">
                        {j.fileName}
                      </Link>
                    </th>
                    <td>
                      <Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(j.startedAt, timezone)}</td>
                    <td className="num">{j.rowsTotal}</td>
                    <td className="num">{j.rowsValid}</td>
                    <td className="num">{j.rowsRejected}</td>
                    <td className="num">{j.snapshotsCreated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>
    </>
  );
}

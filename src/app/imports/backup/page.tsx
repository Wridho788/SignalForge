import path from 'node:path';
import { connection } from 'next/server';
import { Alert, Badge, Notice } from '@/components/ui/feedback';
import { PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { createBackupAction, uploadRestoreAction } from '@/features/data/actions';
import { FileUploadForm } from '@/features/data/forms';
import { InlineActionForm } from '@/features/experiments/forms';
import { resolveDataDir } from '@/lib/config';
import type { SearchParams } from '@/lib/page-helpers';
import { MAX_RESTORE_BYTES, listBackups } from '@/lib/services/backup';
import { getDb } from '@/lib/db/connection';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime } from '@/lib/time';

export const metadata = { title: 'Cadangan dan pemulihan' };

const KIND_LABEL = { manual: 'Manual', 'pre-migrate': 'Sebelum migrasi', 'pre-restore': 'Sebelum pemulihan', other: 'Lainnya' } as const;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default async function BackupPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const dataDir = resolveDataDir();
  const backupDir = path.join(dataDir, 'backups');
  const { timezone } = getAppSettings(getDb());
  const backups = listBackups(backupDir);

  return (
    <>
      <Notice code={sp.notice} />
      <PageHeader title="Cadangan dan pemulihan" description="Salinan lengkap database SignalForge: episode, distribusi, seluruh riwayat snapshot, eksperimen, dan pengaturan." />

      <section aria-labelledby="create-heading" className="card mb-6">
        <h2 id="create-heading" className="mb-2 text-lg font-semibold">
          Buat cadangan
        </h2>
        <p className="mb-3 text-sm text-muted">
          Disimpan di <code className="break-all">{backupDir}</code>. Cadangan juga dibuat otomatis sebelum migrasi skema dan sebelum pemulihan. Cadangan berisi
          seluruh data Anda — simpan di tempat yang aman.
        </p>
        <InlineActionForm action={createBackupAction} submitLabel="Buat cadangan sekarang" pendingLabel="Membuat…" />
      </section>

      <section aria-labelledby="list-heading" className="mb-6">
        <h2 id="list-heading" className="mb-3 text-lg font-semibold">
          Cadangan tersedia
        </h2>
        {backups.length === 0 ? (
          <p className="rounded-control border border-dashed border-line p-4 text-sm text-muted">Belum ada cadangan.</p>
        ) : (
          <TableScroll label="Daftar cadangan">
            <table className="data-table">
              <caption className="sr-only">Cadangan database. Waktu dalam zona {timezone}.</caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Dibuat ({timezone})</th>
                  <th scope="col" className="num">Ukuran</th>
                  <th scope="col">Unduh</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <th scope="row" className="!bg-transparent font-normal break-all">
                      {b.name}
                    </th>
                    <td>
                      <Badge tone="neutral">{KIND_LABEL[b.kind]}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(b.modifiedAt, timezone)}</td>
                    <td className="num">{kb(b.sizeBytes)}</td>
                    <td>
                      <a href={`/imports/backup/download/${encodeURIComponent(b.name)}`} className="text-primary underline" download>
                        Unduh<span className="sr-only"> {b.name}</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>

      <section aria-labelledby="restore-heading" className="card mb-6">
        <h2 id="restore-heading" className="mb-2 text-lg font-semibold">
          Pulihkan dari cadangan
        </h2>
        <Alert tone="warning" title="Memulihkan mengganti seluruh data saat ini">
          Anda akan diminta mengonfirmasi dulu, dan cadangan pra-pemulihan dibuat otomatis. File divalidasi (integritas, skema, dan keamanan) sebelum menyentuh data Anda.
        </Alert>
        <div className="mt-4">
          <FileUploadForm
            action={uploadRestoreAction}
            label="File cadangan (.sqlite)"
            accept=".sqlite,application/vnd.sqlite3,application/octet-stream"
            hint={`Hanya cadangan buatan SignalForge; maksimal ${MAX_RESTORE_BYTES / 1024 / 1024} MB.`}
            submitLabel="Periksa cadangan"
          />
        </div>
      </section>

      <section aria-labelledby="manual-heading" className="card">
        <h2 id="manual-heading" className="mb-2 text-lg font-semibold">
          Pemulihan manual (tanpa aplikasi)
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Hentikan SignalForge (tutup proses <code>pnpm dev</code>/<code>pnpm start</code>).</li>
          <li>
            Salin file database saat ini (<code>signalforge.sqlite</code>, serta <code>-wal</code>/<code>-shm</code> bila ada) ke tempat lain sebagai jaga-jaga.
          </li>
          <li>
            Ganti <code>signalforge.sqlite</code> di <code className="break-all">{dataDir}</code> dengan file cadangan (ubah namanya), hapus file <code>-wal</code> dan <code>-shm</code> lama.
          </li>
          <li>Jalankan SignalForge lagi. Skema yang lebih lama dimigrasikan otomatis (dengan cadangan sebelum migrasi); skema yang lebih baru ditolak.</li>
        </ol>
      </section>
    </>
  );
}

import Link from 'next/link';
import { connection } from 'next/server';
import { Alert, Badge, Notice } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { cancelImportAction, commitImportAction } from '@/features/data/actions';
import { CommitImportForm } from '@/features/data/forms';
import { InlineActionForm } from '@/features/experiments/forms';
import { getDb } from '@/lib/db/connection';
import { DomainError } from '@/lib/domain/errors';
import { orNotFound, type SearchParams } from '@/lib/page-helpers';
import { getFinishedImport, getImportPreview, type ImportPreview } from '@/lib/services/imports';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime } from '@/lib/time';

export const metadata = { title: 'Pratinjau impor' };

const MAX_SHOWN_ERRORS = 100;

export default async function ImportJobPage({
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
  const job = orNotFound(() => getFinishedImport(db, id));

  let preview: ImportPreview | null = null;
  let previewProblem: string | null = null;
  if (job.status === 'previewed') {
    try {
      preview = getImportPreview(db, id, timezone);
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      previewProblem = e.message;
    }
  }

  const plan = preview?.plan;
  return (
    <>
      <Notice code={sp.notice} />
      <Breadcrumbs items={[{ href: '/imports', label: 'Impor CSV' }, { label: job.fileName }]} />
      <PageHeader
        title={job.status === 'previewed' ? 'Pratinjau impor' : 'Ringkasan impor'}
        description={`${job.fileName} · diunggah ${formatDateTime(job.startedAt, timezone)} (${timezone})`}
      />

      <dl className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          ['Baris data', job.rowsTotal],
          ['Valid', job.rowsValid],
          ['Ditolak', job.rowsRejected],
          ['Snapshot dibuat', job.snapshotsCreated],
        ].map(([label, n]) => (
          <div key={label} className="card p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-bold">{n}</dd>
          </div>
        ))}
      </dl>

      {job.status !== 'previewed' ? (
        <div className="card space-y-2">
          <p>
            Status:{' '}
            <Badge tone={job.status === 'committed' ? 'success' : job.status === 'failed' ? 'danger' : 'neutral'}>
              {job.status === 'committed' ? 'Selesai' : job.status === 'failed' ? 'Gagal (dibatalkan)' : 'Dibatalkan'}
            </Badge>
          </p>
          {job.errorSummary ? <p className="text-sm">{job.errorSummary}</p> : null}
          <p className="field-hint">
            Isi file tidak disimpan setelah impor selesai atau dibatalkan. Snapshot yang diimpor ditandai sumber “csv_import”.
          </p>
          <Link href="/imports" className="btn btn-secondary">
            Kembali ke Impor
          </Link>
        </div>
      ) : previewProblem || !plan ? (
        <Alert tone="warning" title="Pratinjau tidak tersedia">
          {previewProblem ?? 'Pratinjau tidak dapat dibuat.'}
        </Alert>
      ) : (
        <>
          <section aria-labelledby="plan-heading" className="card mb-6">
            <h2 id="plan-heading" className="mb-2 text-lg font-semibold">
              Yang akan terjadi
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Episode: <strong>{plan.summary.newEpisodes}</strong> baru, {plan.summary.reusedEpisodes} sudah ada (tidak diubah).
              </li>
              <li>
                Distribusi: <strong>{plan.summary.newDistributions}</strong> baru, {plan.summary.reusedDistributions} sudah ada.
              </li>
              <li>
                Snapshot: <strong>{plan.summary.snapshotsToCreate}</strong> baru ({plan.summary.valueRows} nilai metrik),{' '}
                {plan.summary.duplicateSnapshots} bertabrakan dengan snapshot yang sudah ada.
              </li>
            </ul>
            {plan.assumedLocalTimeRows > 0 ? (
              <p className="field-hint">
                {plan.assumedLocalTimeRows} baris memakai waktu tanpa offset dan dibaca di zona waktu {timezone}.
              </p>
            ) : null}
            {plan.warnings.length > 0 ? (
              <div className="mt-3">
                <Alert tone="warning" title="Perhatian">
                  <ul className="list-disc space-y-1 pl-5">
                    {plan.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}
          </section>

          {plan.errors.length > 0 ? (
            <section aria-labelledby="errors-heading" className="mb-6">
              <h2 id="errors-heading" className="mb-1 text-lg font-semibold">
                Kesalahan per baris ({plan.errors.length})
              </h2>
              <p className="mb-3 text-sm text-muted">
                Nomor baris mengacu pada baris di file (baris 1 = header). Satu snapshot hanya diimpor jika semua barisnya valid.{' '}
                <a href={`/imports/${id}/errors`} className="text-primary underline">
                  Unduh daftar kesalahan (CSV)
                </a>
              </p>
              <TableScroll label="Daftar kesalahan impor">
                <table className="data-table">
                  <caption className="sr-only">Kesalahan per baris pada file CSV.</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="num">Baris</th>
                      <th scope="col">Kolom</th>
                      <th scope="col">Masalah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.errors.slice(0, MAX_SHOWN_ERRORS).map((e, i) => (
                      <tr key={`${e.line}-${e.column}-${i}`}>
                        <td className="num">{e.line}</td>
                        <td>{e.column ?? '—'}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              {plan.errors.length > MAX_SHOWN_ERRORS ? (
                <p className="field-hint">Menampilkan {MAX_SHOWN_ERRORS} pertama; unduh CSV untuk daftar lengkap.</p>
              ) : null}
            </section>
          ) : (
            <div className="mb-6">
              <Alert tone="success" title="Semua baris valid" live="status">
                Tidak ada kesalahan ditemukan. Tinjau ringkasan di atas, lalu impor.
              </Alert>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
            <CommitImportForm
              action={commitImportAction.bind(null, id)}
              duplicates={plan.summary.duplicateSnapshots}
              rejected={plan.rejectedRows}
            />
            <div className="card">
              <h2 className="mb-2 text-lg font-semibold">Batalkan</h2>
              <InlineActionForm action={cancelImportAction.bind(null, id)} submitLabel="Batalkan impor" variant="secondary" />
            </div>
          </div>
        </>
      )}
    </>
  );
}

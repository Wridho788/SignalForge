import Link from 'next/link';
import { connection } from 'next/server';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { StatusBadge } from '@/features/experiments/components';
import { getDb } from '@/lib/db/connection';
import {
  DECISION_LABELS,
  DESIGN_LABELS,
  EXPERIMENT_STATUSES,
  EXPERIMENT_STATUS_LABELS,
  type ExperimentStatus,
} from '@/lib/experiments/model';
import { firstParam, type SearchParams } from '@/lib/page-helpers';
import { listExperiments } from '@/lib/services/experiments';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime } from '@/lib/time';

export const metadata = { title: 'Eksperimen' };

export default async function ExperimentsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const raw = firstParam(sp.status);
  const status = (EXPERIMENT_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as ExperimentStatus) : null;
  const db = getDb();
  const { timezone } = getAppSettings(db);
  const experiments = listExperiments(db, status);
  const total = status ? listExperiments(db).length : experiments.length;

  return (
    <>
      <Notice code={sp.notice} />
      <PageHeader
        title="Eksperimen"
        description="Ubah observasi menjadi hipotesis yang terukur, lalu catat keputusan dan pembelajarannya. Hasil bersifat indikasi, bukan bukti sebab-akibat."
        actions={
          <Link href="/experiments/new" className="btn btn-primary">
            Eksperimen baru
          </Link>
        }
      />

      {total > 0 ? (
        <nav aria-label="Filter status" className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link href="/experiments" aria-current={status === null ? 'true' : undefined} className={`btn ${status === null ? 'btn-primary' : 'btn-secondary'}`}>
            Semua
          </Link>
          {EXPERIMENT_STATUSES.map((s) => (
            <Link key={s} href={`/experiments?status=${s}`} aria-current={status === s ? 'true' : undefined} className={`btn ${status === s ? 'btn-primary' : 'btn-secondary'}`}>
              {EXPERIMENT_STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
      ) : null}

      {experiments.length === 0 ? (
        status ? (
          <EmptyState title={`Tidak ada eksperimen berstatus ${EXPERIMENT_STATUS_LABELS[status]}`} action={{ href: '/experiments', label: 'Lihat semua' }} />
        ) : (
          <EmptyState title="Belum ada eksperimen" action={{ href: '/experiments/new', label: 'Buat eksperimen pertama' }}>
            Mulai dari satu hipotesis yang bisa salah, satu variabel yang diubah, dan kriteria sukses yang ditentukan sebelum melihat hasil.
          </EmptyState>
        )
      ) : (
        <TableScroll label="Daftar eksperimen">
          <table className="data-table">
            <caption className="sr-only">Eksperimen, urut dari yang terakhir diperbarui. Waktu dalam zona {timezone}.</caption>
            <thead>
              <tr>
                <th scope="col">Eksperimen</th>
                <th scope="col">Status</th>
                <th scope="col">Metrik · usia</th>
                <th scope="col">Desain</th>
                <th scope="col" className="num">Baseline</th>
                <th scope="col" className="num">Varian</th>
                <th scope="col">Keputusan</th>
                <th scope="col">Diperbarui ({timezone})</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((x) => (
                <tr key={x.id}>
                  <th scope="row" className="!bg-transparent font-semibold">
                    <Link href={`/experiments/${x.id}`} className="text-primary underline underline-offset-2">
                      {x.title}
                    </Link>
                  </th>
                  <td>
                    <StatusBadge status={x.status} />
                  </td>
                  <td>
                    {x.primaryMetricLabel} · {x.windowHours} j
                  </td>
                  <td className="text-sm">{DESIGN_LABELS[x.design].split(' (')[0]}</td>
                  <td className="num">{x.baselineCount}</td>
                  <td className="num">{x.variantCount}</td>
                  <td>{x.decision ? DECISION_LABELS[x.decision] : '—'}</td>
                  <td className="whitespace-nowrap">{formatDateTime(x.updatedAt, timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}
